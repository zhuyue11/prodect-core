import { Prisma, type Workspace, type WorkspaceMembership } from '@prisma/client';
import { db } from '@/lib/db';
import { workspaceRepository } from '@/lib/repositories/workspaceRepository';
import { workspaceMembershipRepository } from '@/lib/repositories/workspaceMembershipRepository';
import { withWorkspaceContext } from '@/lib/workspaces/context';
import {
  AlreadyMemberError,
  LastMemberError,
  NotAMemberError,
  SlugCollisionError,
} from '@/lib/workspaces/errors';
import { toWorkspaceMemberDTO, toWorkspaceSummaryDTO } from '@/lib/mappers/workspaceMappers';
import type { WorkspaceMemberDTO, WorkspaceSummaryDTO } from '@/lib/dto/workspaces';

// Workspaces service — business logic for the Workspace and
// WorkspaceMembership entities.
//
// `createWorkspace` is the canonical multi-row write: it inserts a
// Workspace AND an owner WorkspaceMembership atomically, and retries on
// slug collisions. `addMember` / `removeMember` exist so the invite
// flow (workspaceInvitesService) and the settings UI (1.2.6) have a
// single business-logic entry point instead of poking the membership
// repo directly.
//
// The 1.2.6 settings surface adds `renameWorkspace`, `deleteWorkspace`,
// and `listMembers`, plus a last-member guard on `removeMember`. All
// three workspace-scoped operations run inside withWorkspaceContext so
// the workspace / workspace_membership RLS policies see the
// per-transaction GUCs (app.user_id / app.workspace_id).

const SLUG_MAX_LENGTH = 60;
const SLUG_SUFFIX_LENGTH = 4;
const SLUG_SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SLUG_RETRY_ATTEMPTS = 3;

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH);
  return slug || 'workspace';
}

function randomSuffix(): string {
  let out = '';
  for (let i = 0; i < SLUG_SUFFIX_LENGTH; i++) {
    out += SLUG_SUFFIX_ALPHABET[Math.floor(Math.random() * SLUG_SUFFIX_ALPHABET.length)];
  }
  return out;
}

function isUniqueViolation(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export interface CreateWorkspaceInput {
  name: string;
  ownerUserId: string;
}

export interface CreateWorkspaceResult {
  workspace: Workspace;
  membership: WorkspaceMembership;
}

export const workspacesService = {
  /**
   * Create a workspace and its owner-membership in a single transaction.
   * The slug is derived from `name`; if that base slug collides on the
   * unique index, we retry with a random 4-char suffix appended. After
   * 3 collisions (which would require astronomically bad luck after the
   * first suffix attempt) we throw SlugCollisionError so the caller
   * surfaces a typed failure rather than a generic Prisma error.
   */
  async createWorkspace(input: CreateWorkspaceInput): Promise<CreateWorkspaceResult> {
    const base = slugify(input.name);
    let lastAttempt = base;

    for (let attempt = 0; attempt < SLUG_RETRY_ATTEMPTS; attempt++) {
      const slug = attempt === 0 ? base : `${base}-${randomSuffix()}`;
      lastAttempt = slug;
      try {
        return await db.$transaction(async (tx) => {
          const workspace = await workspaceRepository.create({ name: input.name, slug }, tx);
          const membership = await workspaceMembershipRepository.create(
            { userId: input.ownerUserId, workspaceId: workspace.id, role: 'member' },
            tx,
          );
          return { workspace, membership };
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          // Can only be the workspace.slug collision (workspace.id was
          // freshly minted, so the membership unique can't fire here).
          continue;
        }
        throw err;
      }
    }
    throw new SlugCollisionError(lastAttempt);
  },

  async findMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership | null> {
    return workspaceMembershipRepository.findByUserAndWorkspace(userId, workspaceId);
  },

  async listUserWorkspaces(userId: string): Promise<Workspace[]> {
    return workspaceMembershipRepository.findWorkspacesByUser(userId);
  },

  /**
   * Add a member to a workspace. Throws AlreadyMemberError when the
   * unique (userId, workspaceId) constraint fires. Wraps the single
   * write in a transaction so the error-translation point stays
   * consistent with the rest of the service surface.
   */
  async addMember(input: {
    userId: string;
    workspaceId: string;
    role?: string;
  }): Promise<WorkspaceMembership> {
    try {
      return await db.$transaction(async (tx) => {
        return workspaceMembershipRepository.create(
          {
            userId: input.userId,
            workspaceId: input.workspaceId,
            role: input.role ?? 'member',
          },
          tx,
        );
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new AlreadyMemberError(input.userId, input.workspaceId);
      }
      throw err;
    }
  },

  /**
   * Remove a member. Returns the deleted row or null if the user
   * wasn't a member to begin with (idempotent Leave / Remove).
   *
   * Enforces the last-member guard: if the target is the only remaining
   * membership, throws LastMemberError instead of deleting — a workspace
   * with zero members is unreachable and undeletable through the UI, so
   * the last member must use Delete, not Leave. The count and the delete
   * run in one transaction (countByWorkspace + delete both take `tx`) so
   * two concurrent leaves can't both observe count > 1 and orphan the
   * workspace.
   *
   * Runs inside withWorkspaceContext so the count read and the delete
   * both see the workspace_membership RLS GUCs. The actor must be a
   * member of `workspaceId` — callers build the WorkspaceContext from a
   * resolved membership, but we keep the workspace-scoped GUC honest by
   * counting only rows the policy exposes.
   */
  async removeMember(input: {
    userId: string;
    workspaceId: string;
  }): Promise<WorkspaceMembership | null> {
    return withWorkspaceContext({ userId: input.userId, workspaceId: input.workspaceId }, (tx) =>
      workspacesService.removeMemberInTx(input, tx),
    );
  },

  async removeMemberInTx(
    input: { userId: string; workspaceId: string },
    tx: Prisma.TransactionClient,
  ): Promise<WorkspaceMembership | null> {
    const existing = await workspaceMembershipRepository.findByUserAndWorkspace(
      input.userId,
      input.workspaceId,
    );
    // Not a member → idempotent no-op (matches the prior contract).
    if (!existing) return null;

    const memberCount = await workspaceMembershipRepository.countByWorkspace(input.workspaceId, tx);
    if (memberCount <= 1) {
      throw new LastMemberError(input.workspaceId);
    }

    return workspaceMembershipRepository.deleteByUserAndWorkspace(
      input.userId,
      input.workspaceId,
      tx,
    );
  },

  /**
   * Rename a workspace. Any member can rename (single-role v1). Asserts
   * membership, then updates the name inside a workspace-scoped
   * transaction so the workspace RLS policy permits the write. The slug
   * is intentionally NOT regenerated — slugs are stable identifiers; a
   * later Subtask can add slug editing if a URL-facing surface needs it.
   */
  async renameWorkspace(input: {
    workspaceId: string;
    actorUserId: string;
    name: string;
  }): Promise<WorkspaceSummaryDTO> {
    await workspacesService.assertMembership(input.actorUserId, input.workspaceId);
    const trimmed = input.name.trim();
    const workspace = await withWorkspaceContext(
      { userId: input.actorUserId, workspaceId: input.workspaceId },
      (tx) => workspaceRepository.update(input.workspaceId, { name: trimmed }, tx),
    );
    return toWorkspaceSummaryDTO(workspace);
  },

  /**
   * Delete a workspace and (via onDelete: Cascade) every child row —
   * memberships now, workspace-scoped data from later Stories later.
   * Asserts membership first, then deletes inside a workspace-scoped
   * transaction so the workspace RLS policy permits the delete.
   */
  async deleteWorkspace(input: { workspaceId: string; actorUserId: string }): Promise<void> {
    await workspacesService.assertMembership(input.actorUserId, input.workspaceId);
    await withWorkspaceContext(
      { userId: input.actorUserId, workspaceId: input.workspaceId },
      (tx) => workspaceRepository.delete(input.workspaceId, tx),
    );
  },

  /**
   * Fetch a single workspace as a summary DTO, or null if the actor is
   * not a member (or the workspace doesn't exist). Asserts membership
   * first so a non-member can't read a workspace by id — this is the
   * application-layer tenant gate; RLS is the structural backstop. Used
   * by the settings page header / cards.
   */
  async getWorkspaceSummary(
    workspaceId: string,
    actorUserId: string,
  ): Promise<WorkspaceSummaryDTO | null> {
    const membership = await workspaceMembershipRepository.findByUserAndWorkspace(
      actorUserId,
      workspaceId,
    );
    if (!membership) return null;
    const workspace = await workspaceRepository.findById(workspaceId);
    return workspace ? toWorkspaceSummaryDTO(workspace) : null;
  },

  /**
   * List the members of a workspace as DTOs for the settings Members
   * card. Reads inside withWorkspaceContext so the workspace_membership
   * RLS policy exposes the rows (it keys off the per-transaction GUCs).
   */
  async listMembers(workspaceId: string, actorUserId: string): Promise<WorkspaceMemberDTO[]> {
    const rows = await withWorkspaceContext({ userId: actorUserId, workspaceId }, (tx) =>
      workspaceMembershipRepository.findMembersByWorkspace(workspaceId, tx),
    );
    return rows.map(toWorkspaceMemberDTO);
  },

  /**
   * Asserts the user is a member of the workspace, throwing
   * NotAMemberError otherwise. Convenience for route handlers that
   * want to gate on membership without writing a null-check by hand.
   */
  async assertMembership(userId: string, workspaceId: string): Promise<void> {
    const m = await workspaceMembershipRepository.findByUserAndWorkspace(userId, workspaceId);
    if (!m) throw new NotAMemberError(userId, workspaceId);
  },
};
