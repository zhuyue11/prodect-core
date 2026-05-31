// Typed errors for the work-items domain. Kept in their own file so callers
// — the service layer (1.4.4), route handlers, server actions — can import
// them without pulling in the Prisma client.
//
// These wrap the DB-layer reality: the kind-parent / depth / cycle rules are
// enforced by Postgres triggers (prisma/sql/work_item_triggers.sql), which
// reject with SQLSTATE 23514 + a message marker. workItemRepository catches
// those at its edge and rethrows the matching class here, so the service
// layer never inspects raw Postgres error codes (the 4-layer rule).
//
// Every class carries a string `tag` discriminant. The service layer can
// `switch (err.tag)` over a `WorkItemError` union exhaustively without
// `instanceof` chains or Prisma-code sniffing. `code` mirrors `tag` and is
// what the route layer (Epic 2) maps to an HTTP status, matching the
// `readonly code` convention the workspaces/projects domains established.

export type WorkItemErrorTag =
  | 'ILLEGAL_PARENT_TYPE'
  | 'DEPTH_LIMIT_EXCEEDED'
  | 'PARENT_CYCLE'
  | 'WORK_ITEM_NOT_FOUND'
  | 'KEY_CONFLICT';

/**
 * Base class for every work-items typed error. Concrete subclasses set a
 * literal `tag` (the discriminant) and a matching `code`.
 */
export abstract class WorkItemError extends Error {
  abstract readonly tag: WorkItemErrorTag;
  abstract readonly code: WorkItemErrorTag;
}

/**
 * The kind-parent matrix was violated — either an illegal parent kind for the
 * child's kind, or the orphan-subtask case (a subtask with no parent). Both
 * trigger markers (WI_ILLEGAL_PARENT_TYPE and WI_SUBTASK_NEEDS_PARENT) map
 * here: structurally they are both "this parent configuration is illegal."
 */
export class IllegalParentTypeError extends WorkItemError {
  readonly tag = 'ILLEGAL_PARENT_TYPE' as const;
  readonly code = 'ILLEGAL_PARENT_TYPE' as const;
  constructor(message = 'Illegal parent for this work-item kind.') {
    super(message);
    this.name = 'IllegalParentTypeError';
  }
}

/**
 * The tree-depth limit (4 levels) would be exceeded by this insert/move.
 */
export class DepthLimitExceededError extends WorkItemError {
  readonly tag = 'DEPTH_LIMIT_EXCEEDED' as const;
  readonly code = 'DEPTH_LIMIT_EXCEEDED' as const;
  constructor(message = 'Work-item tree depth limit (4 levels) exceeded.') {
    super(message);
    this.name = 'DepthLimitExceededError';
  }
}

/**
 * A re-parent would create a cycle (an ancestor moved under its descendant,
 * or a self-parent).
 */
export class ParentCycleError extends WorkItemError {
  readonly tag = 'PARENT_CYCLE' as const;
  readonly code = 'PARENT_CYCLE' as const;
  constructor(message = 'Re-parenting would create a cycle in the work-item tree.') {
    super(message);
    this.name = 'ParentCycleError';
  }
}

/**
 * No work item matched the id / identifier looked up.
 */
export class WorkItemNotFoundError extends WorkItemError {
  readonly tag = 'WORK_ITEM_NOT_FOUND' as const;
  readonly code = 'WORK_ITEM_NOT_FOUND' as const;
  constructor(idOrIdentifier: string) {
    super(`Work item ${idOrIdentifier} not found.`);
    this.name = 'WorkItemNotFoundError';
  }
}

/**
 * A unique-constraint violation on (projectId, key) or (projectId, identifier)
 * — translated from Prisma P2002. In practice the service allocates keys
 * gap-free inside the create transaction, so this should not surface in normal
 * operation; it exists so the repository never leaks a raw Prisma error past
 * its boundary.
 */
export class WorkItemKeyConflictError extends WorkItemError {
  readonly tag = 'KEY_CONFLICT' as const;
  readonly code = 'KEY_CONFLICT' as const;
  constructor(message = 'A work item with this key or identifier already exists in the project.') {
    super(message);
    this.name = 'WorkItemKeyConflictError';
  }
}
