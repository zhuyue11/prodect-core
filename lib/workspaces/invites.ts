import { randomBytes } from 'node:crypto';
import { Prisma, type Verification } from '@prisma/client';
import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';

// Workspace-invite token primitives + email body.
//
// Tokens reuse Better-Auth's Verification table (Subtask 1.1.3):
//   identifier = `workspace-invite:{base64url-token}`
//   value      = JSON.stringify({ workspaceId, email, role, inviterUserId })
//   expiresAt  = now + 7 days
//
// Why reuse Verification: it is the project's catch-all token primitive
// (identifier + value + expiresAt). Password-reset in 1.1.6 uses the same
// table with a `reset-password:` identifier prefix; adding invites with a
// `workspace-invite:` prefix needs no new schema, no new cleanup job, and
// no new index. The `@@index([identifier])` already on the table makes
// prefix lookups and rate-limit scans cheap.
//
// Why 7 days: matches Linear / Slack / GitHub norms — long enough that
// invitees can "get to it later" but short enough that an expired-link
// graveyard does not grow unbounded.
//
// Application-layer auth model: these helpers do not run inside the
// RLS-gated transactions that Subtask 1.2.3 introduces. The routes that
// call them perform an explicit `findMembership(userId, workspaceId)`
// gate before any workspace-scoped operation. After 1.2.3 lands, RLS
// becomes the structural backstop and these helpers continue to work
// unchanged because the membership check already happens at the caller.

export const INVITE_IDENTIFIER_PREFIX = 'workspace-invite:';
export const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITE_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000,
  max: 3,
} as const;

// 24 bytes → 32 base64url chars. base64url is alphabet-safe for URL paths
// and query strings (no `+`/`/`/`=` padding), avoiding any need to encode
// the token before putting it in the email link.
const TOKEN_BYTES = 24;

// Prisma's TransactionClient is the parameter type of $transaction's
// callback. Helpers accept it so callers that want atomicity (e.g. the
// accept endpoint, which deletes the verification + inserts the
// membership) can pass their tx in instead of opening a nested one.
type DbClient = typeof db | Prisma.TransactionClient;

export interface InvitePayload {
  workspaceId: string;
  email: string;
  role: string;
  inviterUserId: string;
}

export interface CreateInviteTokenInput {
  workspaceId: string;
  email: string;
  role: string;
  inviterUserId: string;
  db?: DbClient;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Insert a fresh Verification row representing a pending invite and return
 * the opaque token. The caller embeds the token in the acceptance URL.
 */
export async function createInviteToken(input: CreateInviteTokenInput): Promise<string> {
  const client = input.db ?? db;
  const token = generateToken();
  const payload: InvitePayload = {
    workspaceId: input.workspaceId,
    email: normalizeEmail(input.email),
    role: input.role,
    inviterUserId: input.inviterUserId,
  };
  await client.verification.create({
    data: {
      identifier: INVITE_IDENTIFIER_PREFIX + token,
      value: JSON.stringify(payload),
      expiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
    },
  });
  return token;
}

export interface ReadInviteResult extends InvitePayload {
  expiresAt: Date;
}

/**
 * Look up a token. Returns null on missing OR expired (collapsed so
 * callers cannot accidentally treat "I know this token but it expired"
 * differently from "I don't recognize this token" — both are 404 to the
 * world).
 *
 * Note: a malformed value (Verification row whose `value` is not valid
 * JSON in our shape) is treated as missing, not thrown. Should never
 * happen unless someone hand-edits the table; if it does, the user gets
 * a clean 404 instead of a 500.
 */
export async function readInviteToken(token: string): Promise<ReadInviteResult | null> {
  const row = await db.verification.findFirst({
    where: { identifier: INVITE_IDENTIFIER_PREFIX + token },
  });
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;

  let payload: InvitePayload;
  try {
    payload = JSON.parse(row.value) as InvitePayload;
  } catch {
    return null;
  }
  if (
    typeof payload.workspaceId !== 'string' ||
    typeof payload.email !== 'string' ||
    typeof payload.role !== 'string' ||
    typeof payload.inviterUserId !== 'string'
  ) {
    return null;
  }
  return { ...payload, expiresAt: row.expiresAt };
}

/**
 * Delete the Verification row backing the token. Callers should hand in a
 * transaction client so the deletion happens atomically with the
 * membership insert. Throws Prisma's NotFoundError (P2025) if the row is
 * gone — callers should validate first via readInviteToken.
 */
export async function consumeInviteToken(token: string, client: DbClient = db): Promise<void> {
  await client.verification.deleteMany({
    where: { identifier: INVITE_IDENTIFIER_PREFIX + token },
  });
}

export interface CountRecentInvitesInput {
  workspaceId: string;
  email: string;
}

/**
 * Count invites for (workspaceId, email) created within the rate-limit
 * window. The query is bounded by:
 *   - identifier LIKE 'workspace-invite:%' (uses the existing index)
 *   - createdAt >= now - windowMs
 *   - value contains both the workspaceId AND the lowercased email
 *
 * The substring match on `value` is safe because both workspaceId
 * (cuid: [a-z0-9]+) and email contain no JSON-meaningful punctuation that
 * would cause false-positive matches against unrelated tokens — and we
 * also constrain by identifier prefix, so the universe of rows scanned is
 * already just other invites.
 */
export async function countRecentInvites(input: CountRecentInvitesInput): Promise<number> {
  const since = new Date(Date.now() - INVITE_RATE_LIMIT.windowMs);
  const normalized = normalizeEmail(input.email);
  return db.verification.count({
    where: {
      identifier: { startsWith: INVITE_IDENTIFIER_PREFIX },
      createdAt: { gte: since },
      AND: [{ value: { contains: input.workspaceId } }, { value: { contains: normalized } }],
    },
  });
}

// ---------------------------------------------------------------------------
// Email body
// ---------------------------------------------------------------------------

function resolveBaseUrl(): string {
  // Mirrors lib/auth/index.ts's baseURL resolution so the invite link
  // points at the same canonical origin Better-Auth uses for its own
  // emails. Keeping the resolution identical means a deploy that works
  // for sign-in works for invites too.
  return (
    process.env['BETTER_AUTH_URL'] ??
    (process.env['VERCEL_BRANCH_URL']
      ? `https://${process.env['VERCEL_BRANCH_URL']}`
      : process.env['VERCEL_URL']
        ? `https://${process.env['VERCEL_URL']}`
        : 'http://localhost:3000')
  );
}

export function buildInviteAcceptUrl(token: string): string {
  const base = resolveBaseUrl().replace(/\/+$/, '');
  return `${base}/invite/accept?token=${encodeURIComponent(token)}`;
}

export interface SendInviteEmailInput {
  inviter: { name: string };
  workspace: { name: string };
  recipientEmail: string;
  token: string;
}

export async function sendInviteEmail(input: SendInviteEmailInput): Promise<void> {
  const url = buildInviteAcceptUrl(input.token);
  const subject = `You're invited to join ${input.workspace.name} on Prodect`;

  // Plain-text body — link MUST appear unredacted so dev-console capture
  // (mirroring 1.1.6's password-reset email contract) works in tests.
  const text = [
    'Hi,',
    '',
    `${input.inviter.name} invited you to join ${input.workspace.name} on Prodect.`,
    '',
    `Accept invite: ${url}`,
    '',
    'This invite expires in 7 days.',
    '',
    `Don't know ${input.inviter.name}? You can safely ignore this email.`,
    '',
    '— Prodect',
  ].join('\n');

  // HTML body — mirrors design/workspaces/invite-email-html.png.
  const html = [
    '<div style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">',
    '  <p style="color: #6b7280; font-size: 14px; margin: 0 0 24px;">Prodect</p>',
    '  <p style="font-size: 16px; margin: 0 0 16px;">Hi,</p>',
    `  <p style="font-size: 16px; margin: 0 0 24px;">${escapeHtml(input.inviter.name)} invited you to join ${escapeHtml(input.workspace.name)} on Prodect.</p>`,
    `  <p style="margin: 0 0 24px;"><a href="${url}" style="display: block; background: #4f46e5; color: #ffffff; font-weight: 600; text-decoration: none; padding: 14px 20px; border-radius: 8px; text-align: center;">Accept invite</a></p>`,
    '  <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px;">Or copy this link into your browser:</p>',
    `  <p style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; margin: 0 0 24px;"><a href="${url}" style="color: #2563eb; word-break: break-all;">${url}</a></p>`,
    '  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />',
    '  <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px;">This invite expires in 7 days.</p>',
    `  <p style="color: #6b7280; font-size: 14px; margin: 0;">Don't know ${escapeHtml(input.inviter.name)}? You can safely ignore this email.</p>`,
    '</div>',
  ].join('\n');

  await sendEmail({ to: input.recipientEmail, subject, text, html });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Re-exported so tests and callers don't have to reach into Prisma to
// type the rows they hand back.
export type { Verification };
