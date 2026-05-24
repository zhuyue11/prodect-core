import { db } from '@/lib/db';

// Truncate every table this Story owns, restarting identity counters and
// cascading FK rows. Cheaper than `migrate reset` and idempotent — each
// test's beforeEach calls this so test ordering doesn't matter.
//
// Add tables here as later Subtasks land them (Verification will be
// touched in 1.1.6's password-reset flow; Workspace in Story 1.2).
export async function truncateAuthTables(): Promise<void> {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "session", "account", "verification", "user" RESTART IDENTITY CASCADE',
  );
}
