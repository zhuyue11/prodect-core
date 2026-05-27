import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { AlreadyMemberError } from '@/lib/workspaces/errors';
import { addMember } from '@/lib/workspaces/repo';
import { consumeInviteToken, readInviteToken } from '@/lib/workspaces/invites';

// POST /api/invites/[token]/accept
//
// Atomic: creates the WorkspaceMembership row AND consumes (deletes)
// the Verification row in the same Prisma transaction. If either side
// fails, both are rolled back — so we never leave an orphan token
// pointing at a workspace the user has already joined, and we never
// add a member without invalidating the token.
//
// Idempotency: if the user already has a membership in this workspace
// (e.g. they accept twice from two browser tabs), addMember throws
// AlreadyMemberError. We treat that as success-and-still-consume so
// the second-tab flow lands them on the workspace without a confusing
// error toast.
//
// Email-mismatch policy: we require session.user.email === invite.email
// (both lowercased). We deliberately do NOT auto-link to a different
// account — letting someone sign in as `b@example.com` and accept an
// invite for `a@example.com` would defeat the entire point of
// addressing the invite at all. Mismatch → 403 with a clear message
// telling the user to sign in with the invited address (or ask for a
// new invite).

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function POST(_req: Request, { params }: RouteParams): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not signed in', code: 'UNAUTHENTICATED' }, { status: 401 });
  }

  const { token } = await params;
  const invite = await readInviteToken(token);
  if (!invite) {
    return NextResponse.json(
      { error: 'Invite is expired or no longer valid', code: 'INVITE_EXPIRED_OR_MISSING' },
      { status: 404 },
    );
  }

  const sessionEmail = session.user.email.trim().toLowerCase();
  if (sessionEmail !== invite.email) {
    return NextResponse.json(
      {
        error: `This invite is for ${invite.email}. Sign in with that address, or ask for a new invite.`,
        code: 'INVITE_EMAIL_MISMATCH',
      },
      { status: 403 },
    );
  }

  try {
    await db.$transaction(async (tx) => {
      try {
        await addMember({
          userId: session.user.id,
          workspaceId: invite.workspaceId,
          role: invite.role,
          db: tx,
        });
      } catch (err) {
        if (err instanceof AlreadyMemberError) {
          // Idempotent: still consume the token so the second click is
          // a clean no-op. Don't rethrow.
        } else {
          throw err;
        }
      }
      await consumeInviteToken(token, tx);
    });
  } catch (err) {
    // Surface unexpected errors as 500; we don't catch by type here
    // because anything other than AlreadyMemberError (handled inside)
    // is genuinely unexpected (Prisma errors, DB outage). Log so the
    // server-side error stays visible — the client only gets a generic
    // 500 so we don't leak internals.
    console.error('[invite.accept] transaction failed', err);
    return NextResponse.json(
      { error: 'Could not accept invite', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }

  return NextResponse.json({ workspaceId: invite.workspaceId });
}
