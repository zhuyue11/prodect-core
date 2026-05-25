import { betterAuth } from 'better-auth';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { nextCookies } from 'better-auth/next-js';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { hash, verify } from './passwords';

// Better-Auth instance. Persistence is the real Postgres database via
// Prisma; password hashing is argon2id (overriding Better-Auth's default
// scrypt) so the codebase has exactly one password-hashing primitive
// — see lib/auth/passwords.ts for the why.
//
// Google OAuth is intentionally NOT configured here; that lands in Subtask
// 1.1.4 as a `socialProviders.google = { … }` block plus account-linking
// config tied to lib/users/repo.ts's findOrCreateOAuthUser.
//
// Password reset (Subtask 1.1.6) is wired below via
// emailAndPassword.sendResetPassword. Better-Auth mounts the request
// endpoint at /api/auth/request-password-reset and the confirm endpoint
// at /api/auth/reset-password automatically; reset tokens are stored in
// the existing Verification table (identifier = "reset-password:<token>",
// value = userId). No PasswordResetToken table is needed — see the
// schema's Verification docstring for the wider rationale.
//
// Email verification stays off in this Subtask; a later Subtask will flip
// requireEmailVerification on once the verification-email UX is designed.

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. See .env.example for the required auth env vars.`);
  }
  return value;
}

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: 'postgresql' }),

  secret: requiredEnv('BETTER_AUTH_SECRET'),
  baseURL: process.env['BETTER_AUTH_URL'] ?? 'http://localhost:3000',

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    password: {
      hash,
      verify: ({ hash: stored, password }) => verify(password, stored),
    },
    // 1 hour matches Better-Auth's default; pinned explicitly so the AC
    // is visible in code review and so a future framework default change
    // can't silently widen our reset-token window.
    resetPasswordTokenExpiresIn: 3600,
    // Called by Better-Auth when /api/auth/request-password-reset succeeds.
    // `url` is the canonical link to land the user on the new-password page;
    // its `token` query param is the single-use reset token (also passed as
    // a separate arg so callers don't have to parse the URL).
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: 'Reset your Prodect password',
        text: [
          `Hi ${user.name || ''},`,
          '',
          'We received a request to reset your Prodect password.',
          '',
          `Reset link: ${url}`,
          '',
          'This link expires in 1 hour. If you didn’t request this, you can ignore this email.',
          '',
          '— Prodect',
        ].join('\n'),
        html: [
          '<p>Hi ' + (user.name || '') + ',</p>',
          '<p>We received a request to reset your Prodect password.</p>',
          `<p><a href="${url}">Reset your password</a></p>`,
          `<p>Or copy this link into your browser:<br><code>${url}</code></p>`,
          '<p>This link expires in 1 hour. If you didn’t request this, you can ignore this email.</p>',
          '<p>— Prodect</p>',
        ].join('\n'),
      });
    },
  },

  // Rate-limit configuration. Better-Auth's rate limiter keys requests by
  // client IP (see @better-auth/core's get-request-ip.ts). The Subtask AC
  // asks for "3 requests/hour per email" on password-reset; Better-Auth
  // can't bind a rule to a body field, only to a request path, so we
  // approximate it as "3/hour per IP for /request-password-reset". A
  // single attacker behind one IP can't enumerate; the small UX cost of
  // shared-NAT users hitting the limit is acceptable for v1. Note also
  // that `enabled` defaults to `true` only in production — we set it
  // explicitly so the limiter is active in dev and tests too.
  //
  // The path here is /request-password-reset (not /forget-password):
  // that's the canonical endpoint mounted by better-auth@1.6.11's
  // password.mjs route module.
  rateLimit: {
    enabled: true,
    customRules: {
      '/request-password-reset': {
        window: 3600,
        max: 3,
      },
    },
  },

  // Better-Auth's default session cookie is already httpOnly + sameSite=lax
  // + secure-in-production. Pinning the explicit settings here keeps the AC
  // visible in code review and gives future env-specific overrides an
  // obvious home.
  advanced: {
    cookies: {
      session_token: {
        attributes: {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env['NODE_ENV'] === 'production',
        },
      },
    },
  },

  // The nextCookies plugin makes Set-Cookie headers flow correctly through
  // Next.js Server Actions. Recommended for App Router.
  plugins: [nextCookies()],
});

/**
 * Server-side helper for reading the current session from a React Server
 * Component, Route Handler, or Server Action.
 *
 * Returns `null` when there is no active session. Returns the
 * `{ session, user }` object otherwise — shape is whatever Better-Auth's
 * `auth.api.getSession` returns for the current config.
 *
 * Usage:
 *   const session = await getSession();
 *   if (!session) redirect('/sign-in');
 */
export async function getSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}
