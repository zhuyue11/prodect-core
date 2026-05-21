# prodect-core

Open-source PM substrate for **Prodect** — an AI-native project management tool
for small startup teams. **Open source under GPL-3.0.**

Prodect ships as two repos under an open-core architecture: this repo
(`prodect-core`, GPL-3.0) holds all UI and the PM substrate — Work Items,
Stories, dependencies, boards, GitHub integration. The companion repo
[`prodect-ai`](https://github.com/zhuyue11/prodect-ai) (proprietary, private)
holds the planning intelligence — the agent that turns chat into a structured
Epic → Story → Subtask tree.

Browsers only ever talk to `prodect-core`. The closed-source AI service runs
headless and is called server-to-server. This keeps the user experience unified
(one app, one domain, one cookie) while preserving the GPL boundary (a clean
network service interface is not a derivative work). See
`vision.html` principle #19 in the planning docs for the rationale.

## Setup

```bash
cp .env.example .env       # creates the dev DATABASE_URL
pnpm install
./scripts/db-up.sh         # starts Postgres in Docker and applies migrations
pnpm dev
```

Then open <http://localhost:3000>. You should see a placeholder "Prodect" page
on a dark theme — not the default `create-next-app` welcome page.

> **Postgres port**: the dev DB binds host port `5433` (not `5432`) to coexist
> with other local Postgres instances. Inside the container it's still `5432`.
> If you don't have Docker, install Docker Desktop or
> [OrbStack](https://orbstack.dev) first.

## Stack

- **Runtime**: Node.js ≥20
- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript (strict mode, including `noUncheckedIndexedAccess`)
- **Styling**: Tailwind CSS v4
- **Package manager**: pnpm (pinned via `packageManager` in `package.json` — run `corepack enable`)
- **Persistence**: Postgres 16 (local Docker) + Prisma 7 (with `@prisma/adapter-pg`).
  Connection URL lives in [`prisma.config.ts`](prisma.config.ts); real schema
  (User, Workspace, WorkItem) arrives in Stories 1.1, 1.2, 1.4. The current
  `MigrationMarker` placeholder exists only to prove the migration system works.
- **Auth**: NextAuth / Better-Auth (added in Story 1.1)

## Scripts

| Script           | What it does                                 |
| ---------------- | -------------------------------------------- |
| `pnpm dev`       | Start the dev server on `localhost:3000`     |
| `pnpm build`     | Production build (must pass with 0 warnings) |
| `pnpm start`     | Start the production server                  |
| `pnpm lint`      | Run ESLint                                   |
| `pnpm typecheck` | Run `tsc --noEmit`                           |

## Layout

```
app/          Next.js App Router routes
components/   React UI primitives (filled in Story 1.0.5)
lib/          Server-side logic (DB, auth, agents)
tests/        Vitest unit + Playwright e2e
docs/         Project docs (design system lands here in Story 1.0.5)
public/       Static assets
```

## License

GPL-3.0-only. See [LICENSE](LICENSE) for the full text. The planning
intelligence ships separately under a proprietary license in
[`zhuyue11/prodect-ai`](https://github.com/zhuyue11/prodect-ai) — see
`feasibility.html` ADR-008 in the planning docs for why this open-core split.
