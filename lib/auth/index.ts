import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { nextCookies } from 'better-auth/next-js';
import { headers } from 'next/headers';

// ---------------------------------------------------------------------------
// Better-Auth instance (Subtask 1.1.2: framework wiring only)
// ---------------------------------------------------------------------------
// This Subtask wires Better-Auth into the app *without* persisting users to
// the real database. The User + OAuthAccount tables land in Subtask 1.1.3,
// which will:
//   1. Replace `memoryAdapter({})` below with `prismaAdapter(db, { provider:
//      'postgresql' })` (import from 'better-auth/adapters/prisma' and pull
//      the singleton client from `@/lib/db`).
//   2. Remove this comment block (or downgrade it to a single-line pointer
//      to the migration commit).
//
// Email verification is intentionally OFF here; that flow lands in Subtask
// 1.1.6 alongside the `/lib/email.ts` abstraction.
//
// Google OAuth is intentionally NOT configured here; that lands in Subtask
// 1.1.4 as a one-line `socialProviders.google = { … }` block.
// ---------------------------------------------------------------------------

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. See .env.example for the required auth env vars.`);
  }
  return value;
}

// In-memory storage for 1.1.2 only. Replaced with prismaAdapter in 1.1.3.
//
// Two memory-adapter caveats this code handles:
//   1. Better-Auth's memoryAdapter expects every model it touches to exist
//      as a (possibly empty) array key on the DB object — it does not
//      auto-initialize missing models. We seed the four core models the
//      email/password flow uses (user, session, account, verification).
//   2. Next.js dev mode pools request handlers across multiple workers and
//      tears them down on hot reload. A plain `const inMemoryDb = {…}`
//      ends up with one fresh-and-empty store per worker, which means a
//      sign-up on one request can't be found by getSession on the next.
//      The fix is the same pattern lib/db.ts uses for the Prisma client:
//      stash on globalThis so every worker/reload shares one store. This
//      goes away in 1.1.3 once the real DB is the source of truth.
const globalForAuthDb = globalThis as unknown as {
  __betterAuthMemoryDb?: Record<string, unknown[]>;
};
const inMemoryDb: Record<string, unknown[]> =
  globalForAuthDb.__betterAuthMemoryDb ??
  (globalForAuthDb.__betterAuthMemoryDb = {
    user: [],
    session: [],
    account: [],
    verification: [],
  });

export const auth = betterAuth({
  database: memoryAdapter(inMemoryDb),

  secret: requiredEnv('BETTER_AUTH_SECRET'),
  baseURL: process.env['BETTER_AUTH_URL'] ?? 'http://localhost:3000',

  emailAndPassword: {
    enabled: true,
    // Verification is off until Subtask 1.1.6 wires the email abstraction.
    requireEmailVerification: false,
  },

  // Better-Auth's default session cookie is already httpOnly + sameSite=lax
  // + secure-in-production. We pin the explicit settings here so the AC is
  // visible in code review and so future env-specific overrides have an
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
