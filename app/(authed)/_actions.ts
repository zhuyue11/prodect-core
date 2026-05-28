'use server';

import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { workspacesService } from '@/lib/services/workspacesService';
import { WORKSPACE_COOKIE_NAME } from '@/lib/workspaces';
import type { WorkspaceSummaryDTO } from '@/lib/dto/workspaces';
import { toWorkspaceSummaryDTO } from '@/lib/mappers/workspaceMappers';

// Server Actions shared by the top-nav switcher. These are HTTP/transport
// only (per CLAUDE.md, Server Actions are a route-layer equivalent): they
// read the session, call exactly one service method, and set the cookie.
// No db.* and no $transaction here — the service owns those.

/**
 * Persist the active workspace selection. Validates that the signed-in
 * user is actually a member of the target before trusting the cookie —
 * a forged value can't pin the request to a workspace the user can't
 * access (the workspace-context middleware re-validates on read anyway,
 * but setting an invalid cookie would just silently fall back, so we
 * refuse it here for a clearer contract).
 */
export async function switchWorkspaceAction(workspaceId: string): Promise<void> {
  const session = await getSession();
  if (!session) throw new Error('UNAUTHENTICATED');

  await workspacesService.assertMembership(session.user.id, workspaceId);

  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE_NAME, workspaceId, {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
  });
}

/**
 * Create a new workspace owned by the signed-in user and switch to it.
 * Returns the new workspace summary so the client can reflect it
 * immediately before router.refresh() re-renders the server tree.
 */
export async function createWorkspaceAction(name: string): Promise<WorkspaceSummaryDTO> {
  const session = await getSession();
  if (!session) throw new Error('UNAUTHENTICATED');

  const trimmed = name.trim();
  if (!trimmed) throw new Error('EMPTY_NAME');

  const { workspace } = await workspacesService.createWorkspace({
    name: trimmed,
    ownerUserId: session.user.id,
  });

  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE_NAME, workspace.id, {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: '/',
  });

  return toWorkspaceSummaryDTO(workspace);
}
