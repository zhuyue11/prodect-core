import type { Workspace } from '@prisma/client';
import type { MembershipWithUser } from '@/lib/repositories/workspaceMembershipRepository';
import type { WorkspaceMemberDTO, WorkspaceSummaryDTO } from '@/lib/dto/workspaces';

export function toWorkspaceMemberDTO(row: MembershipWithUser): WorkspaceMemberDTO {
  return {
    userId: row.user.id,
    // Fall back to the email localpart when the user has no display name
    // (OAuth users without a name claim, or pre-name-collection rows).
    name: row.user.name || row.user.email.split('@')[0]!,
    email: row.user.email,
    role: row.role,
  };
}

export function toWorkspaceSummaryDTO(workspace: Workspace): WorkspaceSummaryDTO {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
  };
}
