// Typed errors for the projects domain. Kept in their own file so callers
// — route handlers, server actions, server components — can import them
// without pulling in the Prisma client.
//
// Per CLAUDE.md, services throw typed errors with stable string `code`s;
// route handlers translate those codes to HTTP status codes. The
// membership gate reuses NotAMemberError from lib/workspaces/errors.ts
// rather than duplicating it here.

export class IdentifierCollisionError extends Error {
  readonly code = 'IDENTIFIER_COLLISION' as const;
  constructor(identifier: string) {
    super(
      `Could not generate a unique project identifier after retries (last attempt: ${identifier}).`,
    );
    this.name = 'IdentifierCollisionError';
  }
}

export class ProjectNotFoundError extends Error {
  readonly code = 'PROJECT_NOT_FOUND' as const;
  constructor(projectId: string) {
    super(`Project ${projectId} not found.`);
    this.name = 'ProjectNotFoundError';
  }
}

export class ProjectWorkspaceMismatchError extends Error {
  readonly code = 'PROJECT_WORKSPACE_MISMATCH' as const;
  constructor(projectId: string, workspaceId: string) {
    super(`Project ${projectId} does not belong to workspace ${workspaceId}.`);
    this.name = 'ProjectWorkspaceMismatchError';
  }
}
