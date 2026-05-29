import { Prisma, type Project } from '@prisma/client';
import { db } from '@/lib/db';
import { projectRepository } from '@/lib/repositories/projectRepository';
import { workspaceMembershipRepository } from '@/lib/repositories/workspaceMembershipRepository';
import { NotAMemberError } from '@/lib/workspaces/errors';
import {
  IdentifierCollisionError,
  ProjectNotFoundError,
  ProjectWorkspaceMismatchError,
} from '@/lib/projects/errors';
import { toProjectDTO } from '@/lib/mappers/projectMappers';
import type { ProjectDTO } from '@/lib/dto/projects';

// Projects service — business logic for the Project entity. Owns all
// $transaction calls, the membership gate, identifier/slug derivation +
// collision-retry, and DTO mapping. Mirrors workspacesService: each retry
// opens a FRESH transaction because a P2002 poisons the current one.
//
// getActiveProject + RLS land in Subtask 1.3.2 — NOT built here. The
// service is structured (assertMembership helper, setActiveProject already
// present) so 1.3.2 can add the getter cleanly.

// ── Identifier derivation rule ──────────────────────────────────────────
// The identifier is a 3-5 char, uppercase, workspace-unique handle that
// prefixes work-item keys (e.g. "PROD-42"). Rule:
//   1. Uppercase the name and strip everything that isn't A-Z or 0-9.
//   2. Take the first 5 of those characters as the base.
//   3. If fewer than 3 remain (short or symbol-only names), right-pad with
//      'X' up to 3 chars so the identifier is always at least 3 chars
//      ("X" → "XXX", "Hi" → "HIX", "A1" → "A1X").
//   4. Empty after stripping (e.g. "!!!") falls back to "PRJ".
// On a workspace-unique collision we append a numeric suffix to the base,
// keeping the whole thing within 5 chars by trimming the base as needed
// ("PROD" → "PROD1" … "PROD9" → "PRO10" …).
const IDENTIFIER_MIN_LENGTH = 3;
const IDENTIFIER_MAX_LENGTH = 5;
const IDENTIFIER_FALLBACK = 'PRJ';
const SLUG_MAX_LENGTH = 60;
const SLUG_SUFFIX_LENGTH = 4;
const SLUG_SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const RETRY_ATTEMPTS = 5;

function deriveIdentifierBase(name: string): string {
  const cleaned = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length === 0) return IDENTIFIER_FALLBACK;
  const base = cleaned.slice(0, IDENTIFIER_MAX_LENGTH);
  return base.padEnd(IDENTIFIER_MIN_LENGTH, 'X');
}

// Normalize a caller-supplied identifier the same way (uppercase, strip,
// clamp to 3-5 chars) so an explicit identifier still obeys the column's
// shape contract.
function normalizeIdentifier(identifier: string): string {
  const cleaned = identifier.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleaned.length === 0) return IDENTIFIER_FALLBACK;
  return cleaned.slice(0, IDENTIFIER_MAX_LENGTH).padEnd(IDENTIFIER_MIN_LENGTH, 'X');
}

// Append a numeric suffix while staying within IDENTIFIER_MAX_LENGTH by
// trimming the base end as the suffix grows.
function identifierWithSuffix(base: string, suffix: number): string {
  const suffixStr = String(suffix);
  const keep = Math.max(1, IDENTIFIER_MAX_LENGTH - suffixStr.length);
  return `${base.slice(0, keep)}${suffixStr}`;
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH);
  return slug || 'project';
}

function randomSlugSuffix(): string {
  let out = '';
  for (let i = 0; i < SLUG_SUFFIX_LENGTH; i++) {
    out += SLUG_SUFFIX_ALPHABET[Math.floor(Math.random() * SLUG_SUFFIX_ALPHABET.length)];
  }
  return out;
}

function isUniqueViolation(err: unknown): err is Prisma.PrismaClientKnownRequestError {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

// Which field collided, from the P2002 meta.target. The unique indexes are
// (workspaceId, slug) and (workspaceId, identifier); Prisma reports the
// target field list so we can re-suffix only the colliding one.
function collisionField(err: Prisma.PrismaClientKnownRequestError): 'slug' | 'identifier' | null {
  const target = err.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
  if (fields.some((f) => f.includes('identifier'))) return 'identifier';
  if (fields.some((f) => f.includes('slug'))) return 'slug';
  return null;
}

export interface CreateProjectInput {
  workspaceId: string;
  actorUserId: string;
  name: string;
  identifier?: string;
}

export const projectsService = {
  /**
   * Create a project in a workspace. Asserts the actor is a member, derives
   * a workspace-unique 3-5-char uppercase identifier + a slug from the name
   * (or normalizes a caller-supplied identifier), and inserts in one
   * transaction. On a unique-violation we re-suffix ONLY the colliding
   * field (identifier or slug) and retry in a FRESH transaction — a P2002
   * poisons the current one, so we can't catch-and-continue inside a single
   * `tx`. After RETRY_ATTEMPTS we throw IdentifierCollisionError. Returns a
   * DTO, never a raw Prisma row.
   */
  async createProject(input: CreateProjectInput): Promise<ProjectDTO> {
    await projectsService.assertMembership(input.actorUserId, input.workspaceId);

    const trimmedName = input.name.trim();
    const identifierBase = input.identifier
      ? normalizeIdentifier(input.identifier)
      : deriveIdentifierBase(trimmedName);
    const slugBase = slugify(trimmedName);

    let identifier = identifierBase;
    let slug = slugBase;
    let lastIdentifier = identifier;

    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      lastIdentifier = identifier;
      try {
        const project = await db.$transaction((tx) =>
          projectRepository.create(
            { workspaceId: input.workspaceId, name: trimmedName, slug, identifier },
            tx,
          ),
        );
        return toProjectDTO(project);
      } catch (err) {
        if (isUniqueViolation(err)) {
          const field = collisionField(err);
          if (field === 'slug') {
            slug = `${slugBase}-${randomSlugSuffix()}`;
          } else {
            // identifier collision (or an unattributable P2002 on the
            // project's unique indexes) → bump the numeric suffix.
            identifier = identifierWithSuffix(identifierBase, attempt + 1);
          }
          continue;
        }
        throw err;
      }
    }
    throw new IdentifierCollisionError(lastIdentifier);
  },

  /**
   * Rename a project. Asserts membership, updates the name in a
   * transaction. Slug + identifier are stable (not regenerated) — they are
   * durable handles that work-item keys and URLs depend on.
   */
  async renameProject(input: {
    projectId: string;
    workspaceId: string;
    actorUserId: string;
    name: string;
  }): Promise<ProjectDTO> {
    await projectsService.assertMembership(input.actorUserId, input.workspaceId);
    await projectsService.assertProjectInWorkspace(input.projectId, input.workspaceId);
    const trimmed = input.name.trim();
    const project = await db.$transaction((tx) =>
      projectRepository.update(input.projectId, { name: trimmed }, tx),
    );
    return toProjectDTO(project);
  },

  /**
   * Soft-delete (archive) a project. Asserts membership, stamps archivedAt
   * in a transaction. Never hard-deletes — work-item history (Story 1.4)
   * survives the archive.
   */
  async archiveProject(input: {
    projectId: string;
    workspaceId: string;
    actorUserId: string;
  }): Promise<void> {
    await projectsService.assertMembership(input.actorUserId, input.workspaceId);
    await projectsService.assertProjectInWorkspace(input.projectId, input.workspaceId);
    await db.$transaction((tx) => projectRepository.archive(input.projectId, tx));
  },

  /**
   * List the non-archived projects in a workspace as DTOs. Asserts the
   * actor is a member first — the application-layer tenant gate (RLS is the
   * structural backstop, landing in 1.3.2).
   */
  async listProjects(workspaceId: string, actorUserId: string): Promise<ProjectDTO[]> {
    await projectsService.assertMembership(actorUserId, workspaceId);
    const projects = await projectRepository.findByWorkspace(workspaceId);
    return projects.map(toProjectDTO);
  },

  /**
   * Set the user's active project within a workspace (or clear it with
   * null). Asserts membership and that the project belongs to the
   * workspace, then updates the membership row in a transaction.
   */
  async setActiveProject(input: {
    userId: string;
    workspaceId: string;
    projectId: string | null;
  }): Promise<void> {
    await projectsService.assertMembership(input.userId, input.workspaceId);
    if (input.projectId !== null) {
      await projectsService.assertProjectInWorkspace(input.projectId, input.workspaceId);
    }
    await db.$transaction((tx) =>
      workspaceMembershipRepository.setActiveProject(
        input.userId,
        input.workspaceId,
        input.projectId,
        tx,
      ),
    );
  },

  /**
   * Asserts the user is a member of the workspace, throwing NotAMemberError
   * otherwise. Reuses the workspaces-domain error rather than duplicating a
   * project-specific one.
   */
  async assertMembership(userId: string, workspaceId: string): Promise<void> {
    const m = await workspaceMembershipRepository.findByUserAndWorkspace(userId, workspaceId);
    if (!m) throw new NotAMemberError(userId, workspaceId);
  },

  /**
   * Asserts the project exists and belongs to the given workspace. Guards
   * cross-workspace writes (a member of workspace A can't rename/archive a
   * project that lives in workspace B). Returns the Project for callers
   * that want it.
   */
  async assertProjectInWorkspace(projectId: string, workspaceId: string): Promise<Project> {
    const project = await projectRepository.findById(projectId);
    if (!project) throw new ProjectNotFoundError(projectId);
    if (project.workspaceId !== workspaceId) {
      throw new ProjectWorkspaceMismatchError(projectId, workspaceId);
    }
    return project;
  },
};
