import { betterAuth } from 'better-auth';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import { nextCookies } from 'better-auth/next-js';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
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
// Email verification stays off in this Subtask; Subtask 1.1.6 wires the
// email abstraction and flips requireEmailVerification on.

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
