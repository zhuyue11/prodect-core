import { Prisma, type WorkItem, type WorkItemKind } from '@prisma/client';
import { db } from '@/lib/db';
import {
  DepthLimitExceededError,
  IllegalParentTypeError,
  ParentCycleError,
  WorkItemKeyConflictError,
  WorkItemNotFoundError,
} from '@/lib/workItems/errors';

// Work-item repository — single Prisma operations on the `work_item` table.
// Writes require `tx` (compile-time guarantee they run in a transaction);
// pure read paths use the `db` singleton (with an optional `tx` for reads
// that run inside a transaction). No business logic, no transactions, no DTO
// mapping here — those belong in workItemsService (Subtask 1.4.4).
//
// The DB-layer triggers (prisma/sql/work_item_triggers.sql) enforce the
// kind-parent matrix, the depth limit, and cycle prevention. On INSERT /
// UPDATE they reject with SQLSTATE 23514 + a message marker; create/update
// translate those markers into the typed errors from lib/workItems/errors.ts
// at this edge, so the service layer never inspects Prisma/Postgres error
// codes (the 4-layer rule). P2002 (unique key/identifier) and P2025 (record
// not found) are translated here too.

/**
 * A row of `findSubtree`'s recursive-CTE result: the work item plus its
 * `depth` (1 = the root passed in, 2 = its children, …). `kind` is cast to
 * text in the query (the enum would otherwise come back as a Prisma enum);
 * `position` is already a text column. This is intentionally NOT a `WorkItem`
 * — it's the raw tree-walk projection.
 */
export interface WorkItemSubtreeRow {
  id: string;
  parentId: string | null;
  kind: WorkItemKind;
  key: number;
  identifier: string;
  title: string;
  status: string;
  position: string;
  depth: number;
}

export const workItemRepository = {
  async findById(id: string, tx?: Prisma.TransactionClient): Promise<WorkItem | null> {
    const client = tx ?? db;
    return client.workItem.findUnique({ where: { id } });
  },

  async findByIdentifier(
    projectId: string,
    identifier: string,
    tx?: Prisma.TransactionClient,
  ): Promise<WorkItem | null> {
    const client = tx ?? db;
    return client.workItem.findUnique({
      where: { projectId_identifier: { projectId, identifier } },
    });
  },

  /**
   * Non-archived work items in a project, cursor-paginated. Ordered by `key`
   * asc (stable, monotonic, matches the PROD-N identifier order). `cursor` is
   * a work-item id; when present the row at the cursor is skipped so paging
   * doesn't repeat it.
   */
  async findByProject(
    projectId: string,
    options: { take?: number; cursor?: string } = {},
    tx?: Prisma.TransactionClient,
  ): Promise<WorkItem[]> {
    const client = tx ?? db;
    const { take = 50, cursor } = options;
    return client.workItem.findMany({
      where: { projectId, archivedAt: null },
      orderBy: { key: 'asc' },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  },

  /**
   * Direct (non-archived) children of a work item, ordered by fractional
   * `position`. One level only — for the full subtree use `findSubtree`.
   */
  async findChildren(parentId: string, tx?: Prisma.TransactionClient): Promise<WorkItem[]> {
    const client = tx ?? db;
    return client.workItem.findMany({
      where: { parentId, archivedAt: null },
      orderBy: { position: 'asc' },
    });
  },

  /**
   * The full subtree rooted at `rootId`, in ONE round-trip via a recursive
   * CTE. Returns each row with its `depth` (root = 1), ordered depth-first by
   * position so the result reads as a pre-order tree walk. Identifiers are
   * double-quoted because the columns are camelCase; `kind` is cast to text so
   * `$queryRaw` returns the plain enum label.
   */
  async findSubtree(rootId: string, tx?: Prisma.TransactionClient): Promise<WorkItemSubtreeRow[]> {
    const client = tx ?? db;
    return client.$queryRaw<WorkItemSubtreeRow[]>`
      WITH RECURSIVE subtree AS (
        SELECT w."id", w."parentId", w."kind", w."key", w."identifier",
               w."title", w."status", w."position", 1 AS depth
          FROM "work_item" w
          WHERE w."id" = ${rootId}
        UNION ALL
        SELECT w."id", w."parentId", w."kind", w."key", w."identifier",
               w."title", w."status", w."position", s.depth + 1
          FROM "work_item" w
          JOIN subtree s ON w."parentId" = s."id"
      )
      SELECT "id",
             "parentId",
             "kind"::text       AS "kind",
             "key",
             "identifier",
             "title",
             "status",
             "position",
             depth::int AS "depth"
        FROM subtree
        ORDER BY depth ASC, "position" ASC`;
  },

  /**
   * Create a work item. Required `tx`. The DB triggers validate the
   * kind-parent matrix + depth on insert; their SQLSTATE-23514 rejections and
   * a P2002 unique violation are translated to typed errors here.
   */
  async create(
    data: Prisma.WorkItemUncheckedCreateInput,
    tx: Prisma.TransactionClient,
  ): Promise<WorkItem> {
    try {
      return await tx.workItem.create({ data });
    } catch (err) {
      throw translateWriteError(err);
    }
  },

  /**
   * Patch a work item. Required `tx`. The triggers re-validate on a
   * parentId/kind change (and reject re-parent cycles); a missing row yields
   * a typed not-found error.
   */
  async update(
    id: string,
    patch: Prisma.WorkItemUncheckedUpdateInput,
    tx: Prisma.TransactionClient,
  ): Promise<WorkItem> {
    try {
      return await tx.workItem.update({ where: { id }, data: patch });
    } catch (err) {
      throw translateWriteError(err, { id });
    }
  },

  /**
   * Soft-delete: stamp `archivedAt = now()`. Work items are NEVER hard-deleted
   * (the Project pattern) — revision history (1.4.6) must survive an archive.
   */
  async archive(id: string, tx: Prisma.TransactionClient): Promise<WorkItem> {
    try {
      return await tx.workItem.update({ where: { id }, data: { archivedAt: new Date() } });
    } catch (err) {
      throw translateWriteError(err, { id });
    }
  },
};

// --- Prisma/Postgres error → typed error translation (repository edge) ------

/**
 * Translate a write-path error into a typed work-items error. Trigger
 * rejections arrive (via the pg driver adapter) as an error whose `cause.code`
 * is SQLSTATE 23514 and whose message carries one of the WI_* markers; we key
 * on the marker (unique strings we control) and confirm via the SQLSTATE.
 * P2002 → key conflict; P2025 → not found. Anything else is rethrown
 * unchanged. Always throws — return type is `never`.
 */
function translateWriteError(err: unknown, ctx?: { id?: string }): never {
  const message = extractMessage(err);
  const sqlState = extractSqlState(err);

  if (sqlState === '23514' || isTriggerMarker(message)) {
    if (message.includes('WI_ILLEGAL_PARENT_TYPE') || message.includes('WI_SUBTASK_NEEDS_PARENT')) {
      throw new IllegalParentTypeError(message);
    }
    if (message.includes('WI_DEPTH_LIMIT_EXCEEDED')) {
      throw new DepthLimitExceededError(message);
    }
    if (message.includes('WI_PARENT_CYCLE')) {
      throw new ParentCycleError(message);
    }
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') throw new WorkItemKeyConflictError();
    if (err.code === 'P2025') throw new WorkItemNotFoundError(ctx?.id ?? '(unknown)');
  }

  throw err;
}

function isTriggerMarker(message: string): boolean {
  return (
    message.includes('WI_ILLEGAL_PARENT_TYPE') ||
    message.includes('WI_SUBTASK_NEEDS_PARENT') ||
    message.includes('WI_DEPTH_LIMIT_EXCEEDED') ||
    message.includes('WI_PARENT_CYCLE')
  );
}

/** SQLSTATE from a pg driver-adapter error's `cause`, if present. */
function extractSqlState(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'cause' in err) {
    const cause = (err as { cause?: unknown }).cause;
    if (cause && typeof cause === 'object') {
      const c = cause as { code?: unknown; originalCode?: unknown };
      if (typeof c.code === 'string') return c.code;
      if (typeof c.originalCode === 'string') return c.originalCode;
    }
  }
  return undefined;
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}
