import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { readInviteToken } from '@/lib/workspaces/invites';

// GET /api/invites/[token]
//
// Validates an invite token and returns the info the acceptance UI
// needs to render: workspace name, inviter name, the invited email
// (so the UI can warn if the signed-in user's email doesn't match
// without making an extra API roundtrip).
//
// Returns 404 INVITE_EXPIRED_OR_MISSING on both missing and expired —
// callers must NOT distinguish, since exposing "this token existed but
// expired" gives nothing useful and slightly leaks the existence of
// past invites. No session required: the token IS the credential for
// reading the invite metadata; the accept endpoint enforces the
// session-email match.

interface RouteParams {
  params: Promise<{ token: string }>;
}

export async function GET(_req: Request, { params }: RouteParams): Promise<Response> {
  const { token } = await params;
  const invite = await readInviteToken(token);
  if (!invite) {
    return NextResponse.json(
      { error: 'Invite is expired or no longer valid', code: 'INVITE_EXPIRED_OR_MISSING' },
      { status: 404 },
    );
  }

  // Resolve both the inviter (name) and the workspace (name) in
  // parallel — they're independent lookups and the latency adds up if
  // sequential.
  const [workspace, inviter] = await Promise.all([
    db.workspace.findUnique({ where: { id: invite.workspaceId } }),
    db.user.findUnique({ where: { id: invite.inviterUserId } }),
  ]);

  if (!workspace) {
    // Workspace got deleted after the invite was sent (cascade would
    // not remove the Verification row — that table has no FK to
    // workspace by design). Treat as missing.
    return NextResponse.json(
      { error: 'Invite is expired or no longer valid', code: 'INVITE_EXPIRED_OR_MISSING' },
      { status: 404 },
    );
  }

  return NextResponse.json({
    workspaceName: workspace.name,
    inviterName: inviter?.name ?? 'A teammate',
    email: invite.email,
  });
}
