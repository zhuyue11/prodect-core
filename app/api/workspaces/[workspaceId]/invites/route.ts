import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { findMembership } from '@/lib/workspaces/repo';
import {
  countRecentInvites,
  createInviteToken,
  INVITE_RATE_LIMIT,
  sendInviteEmail,
} from '@/lib/workspaces/invites';

// POST /api/workspaces/[workspaceId]/invites
//
// Sends a workspace invite email. The recipient does NOT need a prior
// account — they'll be prompted to sign in or sign up when they click
// the accept link. We do block invites to addresses that already belong
// to the workspace, so the settings UI can surface that distinction
// inline ("already a member") rather than silently no-op.
//
// Auth model: requires a session AND an active membership in
// `workspaceId`. The membership check is the application-layer gate
// today; Subtask 1.2.3 will add RLS as a structural backstop. The two
// layers are complementary, not redundant — RLS protects against bypass
// of the route layer (direct DB / different handler), while this check
// gives us a clean 403 with a typed code at the API boundary.

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RouteParams {
  params: Promise<{ workspaceId: string }>;
}

export async function POST(req: Request, { params }: RouteParams): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { workspaceId } = await params;

  // Body parsing. JSON-only; any other content-type is a client bug.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', code: 'BAD_REQUEST' }, { status: 400 });
  }
  const rawEmail =
    body && typeof body === 'object' && 'email' in body && typeof body.email === 'string'
      ? body.email
      : null;
  if (!rawEmail) {
    return NextResponse.json(
      { error: 'Missing "email" field', code: 'BAD_REQUEST' },
      { status: 400 },
    );
  }
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_SHAPE.test(email)) {
    return NextResponse.json(
      { error: 'Email format is invalid', code: 'INVALID_EMAIL' },
      { status: 400 },
    );
  }

  // Requester must be a member of the target workspace.
  const requesterMembership = await findMembership(session.user.id, workspaceId);
  if (!requesterMembership) {
    return NextResponse.json(
      { error: 'You are not a member of this workspace', code: 'NOT_A_MEMBER' },
      { status: 403 },
    );
  }

  // Block invites to addresses already in the workspace. Only resolves a
  // membership when the email actually maps to an existing user — an
  // invite to a brand-new email is fine.
  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) {
    const targetMembership = await findMembership(existingUser.id, workspaceId);
    if (targetMembership) {
      return NextResponse.json(
        { error: 'This user is already a member of the workspace', code: 'ALREADY_MEMBER' },
        { status: 422 },
      );
    }
  }

  // Rate limit: 3 per (workspaceId, email) per hour. We check BEFORE the
  // insert so a 4th attempt within the window never writes a row and
  // never spams the inbox.
  const recent = await countRecentInvites({ workspaceId, email });
  if (recent >= INVITE_RATE_LIMIT.max) {
    return NextResponse.json(
      {
        error: `Already sent ${INVITE_RATE_LIMIT.max} invites recently; please wait before sending another.`,
        code: 'RATE_LIMITED',
      },
      { status: 429 },
    );
  }

  const workspace = await db.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) {
    // Shouldn't reach here — findMembership above proved the workspace
    // exists. Defensive 404 for the cascade-delete race.
    return NextResponse.json({ error: 'Workspace not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  const token = await createInviteToken({
    workspaceId,
    email,
    role: 'member',
    inviterUserId: session.user.id,
  });
  await sendInviteEmail({
    inviter: { name: session.user.name },
    workspace: { name: workspace.name },
    recipientEmail: email,
    token,
  });

  return NextResponse.json({ ok: true });
}
