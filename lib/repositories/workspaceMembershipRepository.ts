import { Prisma, type User, type Workspace, type WorkspaceMembership } from '@prisma/client';
import { db } from '@/lib/db';

// A membership row joined with the slice of its user the members list
// renders. Kept here (not in the service) because the join shape is a
// data-access concern; the service maps it to a DTO.
export type MembershipWithUser = WorkspaceMembership & {
  user: Pick<User, 'id' | 'name' | 'email'>;
};

// WorkspaceMembership repository — single Prisma operations on the
// `workspace_membership` join table. Owns its own file (not nested under
// workspaceRepository) because the primary entity it operates on is
// WorkspaceMembership, not Workspace.

export const workspaceMembershipRepository = {
  async findByUserAndWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceMembership | null> {
    return db.workspaceMembership.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
  },

  /**
   * Workspaces the user belongs to, ordered by membership.createdAt asc
   * so the auto-created default workspace (Subtask 1.2.4) lands first in
   * the switcher list (Subtask 1.2.6).
   */
  async findWorkspacesByUser(userId: string): Promise<Workspace[]> {
    const rows = await db.workspaceMembership.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: { workspace: true },
    });
    return rows.map((r) => r.workspace);
  },

  /**
   * Members of a workspace joined with the user fields the settings
   * Members card renders, ordered by membership.createdAt asc so the
   * owner (first membership) lands first. Takes `tx` because the
   * workspace_membership RLS policy reads the per-transaction GUCs set
   * by withWorkspaceContext — outside that transaction the policy sees
   * NULL and returns zero rows under the non-bypass app role.
   */
  async findMembersByWorkspace(
    workspaceId: string,
    tx: Prisma.TransactionClient,
  ): Promise<MembershipWithUser[]> {
    return tx.workspaceMembership.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  },

  /**
   * Count of memberships in a workspace. Takes `tx` so the last-member
   * guard in workspacesService.removeMember reads the count and deletes
   * the row in the same transaction — preventing a TOCTOU race where two
   * concurrent leaves both see count > 1 and both delete, orphaning the
   * workspace.
   */
  async countByWorkspace(workspaceId: string, tx: Prisma.TransactionClient): Promise<number> {
    return tx.workspaceMembership.count({ where: { workspaceId } });
  },

  async create(
    data: { userId: string; workspaceId: string; role: string },
    tx: Prisma.TransactionClient,
  ): Promise<WorkspaceMembership> {
    return tx.workspaceMembership.create({ data });
  },

  /**
   * Returns the deleted membership row, or null if no matching row
   * existed (treats "already gone" as a no-op rather than an error —
   * the Leave / Remove flows in the settings UI rely on this).
   */
  async deleteByUserAndWorkspace(
    userId: string,
    workspaceId: string,
    tx: Prisma.TransactionClient,
  ): Promise<WorkspaceMembership | null> {
    try {
      return await tx.workspaceMembership.delete({
        where: { userId_workspaceId: { userId, workspaceId } },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return null;
      }
      throw err;
    }
  },
};
