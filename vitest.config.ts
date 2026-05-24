import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

// Load .env into process.env before Vitest evaluates the test files. Next.js
// does this automatically at runtime; Vitest does not. Without this load,
// lib/db.ts throws "DATABASE_URL is not set" at module-import time and the
// suite fails before any test runs.
loadEnv();

// Vitest is configured for Node integration tests against a real Postgres.
// Browser-style component tests (jsdom/happy-dom) aren't needed yet; if
// they arrive in Story 1.1.5 (sign-in pages) or later, split this into
// `vitest.workspace.ts` rather than dual-mode a single config.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // DB-backed tests share connections to the local Postgres; running
    // them in parallel forks would cause cross-test row interference.
    // Serial is fine — total suite is small.
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      '@': resolve(fileURLToPath(new URL('.', import.meta.url))),
    },
  },
});
