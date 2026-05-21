import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma 7 doesn't auto-load .env when evaluating this config file (in
// contrast to Prisma 6's CLI behavior). Load it explicitly so DATABASE_URL
// is available below.
loadEnv();

function requireDatabaseUrl(): string {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and start the ' +
        'dev DB with `./scripts/db-up.sh`.',
    );
  }
  return url;
}

// The CLI config: where the schema lives, where migrations live, and the
// datasource URL the CLI uses for `prisma migrate` / `prisma db` commands.
// The runtime adapter (PrismaPg) is wired up separately in `lib/db.ts` —
// adapters belong to the client constructor, not the CLI config.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: requireDatabaseUrl(),
  },
});
