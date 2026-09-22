# Pokétistix

Pokétistix is a monorepo containing a modern web application and a WebAssembly-based Pokémon damage calculator.

## 🏗️ Architecture

```mermaid
flowchart LR
    subgraph Browser["Browser"]
        WEB["Next.js App"]
    end

    subgraph SaaS["Backend & SaaS"]
        SB[("Supabase<br/>PostgreSQL + Auth")]
        CF["Cloudflare Workers<br/>docs-search API (Hono + D1)"]
        SEN["Sentry<br/>errors + traces"]
        VCL["Vercel<br/>hosting + analytics"]
    end

    subgraph PKG["Workspace packages"]
        DC["damage-calc<br/>Rust → Wasm"]
        DT["data<br/>game datasets"]
        EN["engine<br/>sim core (Rust)"]
        PM["pkmn-meta<br/>sim meta data"]
    end

    EXT1["Google OAuth"]
    EXT3["pokepast.es<br/>paste export"]

    WEB -- "Auth + SQL (Drizzle)" --> SB
    SB -- "social login" --> EXT1
    WEB -- "docs full-text search" --> CF
    WEB -- "error reports" --> SEN
    WEB -- "hosting + analytics" --> VCL
    WEB -- "damage calc (Wasm)" --> DC
    WEB -- "game data" --> DT
    WEB -- "share export" --> EXT3
```

## 🛠️ Tech Stack

### Application (`apps/web`)
- **Framework:** [Next.js](https://nextjs.org/) 16 (App Router, React 19)
- **Database & Backend:** [Supabase](https://supabase.com/) (PostgreSQL) + [Drizzle ORM](https://orm.drizzle.team/)
- **State Management & Data Fetching:** [Jotai](https://jotai.org/), [React Query](https://tanstack.com/query/latest)
- **Styling & UI:** Material UI, Base UI, Emotion
- **Content:** [Content Collections](https://www.content-collections.dev/) (docs/blog MDX), i18n via `i18next` + `react-i18next` (ja/en)
- **Monitoring:** [Sentry](https://sentry.io/) (error tracking + OpenTelemetry spans)
- **Tooling:** Vitest (Testing), [Oxc](https://oxc-project.github.io/) (`oxlint`, `oxfmt`) for lightning-fast linting and formatting

### Packages (`packages/*`)
- **`@poketistix/damage-calc`:** High-performance Pokémon damage calculator written in **Rust** and compiled to **WebAssembly (Wasm)**.
- **`@poketistix/engine`:** Pokémon simulation engine, powered by Rust/WebAssembly.
- **`@poketistix/data`:** Pokémon game datasets (master/champions data).
- **`@poketistix/pkmn-meta`:** Pokémon simulation meta data.

### Workers (`workers/*`)
- **`docs-search`:** Documentation search API built with [Hono](https://hono.dev/), deployed to [Cloudflare Workers](https://workers.cloudflare.com/) with [D1](https://developers.cloudflare.com/d1/) (`poketistix-docs` database). Managed with [Wrangler](https://developers.cloudflare.com/workers/wrangler/).

### Monorepo Tooling
- **Package Manager:** [pnpm](https://pnpm.io/) (v12+, workspaces with recursive `pnpm -r` scripts)
- **Versioning & Releases:** [Changesets](https://github.com/changesets/changesets)

---

## 🚀 Setup Instructions

### Prerequisites
Ensure you have the following installed on your system:
- [Node.js](https://nodejs.org/) (v26+, see the `volta` pin in `package.json`)
- [pnpm](https://pnpm.io/) (v12+)
- [Rust & Cargo](https://rustup.rs/) (with the `wasm32-unknown-unknown` target)
- [`wasm-pack`](https://rustwasm.github.io/wasm-pack/) (Install via `cargo install wasm-pack`)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (Requires Docker for local development)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Must be running for Supabase)

### Environment Variables
Before running the app, you need to configure your environment variables. 
For local development, create a `.env.local` file in the `apps/web` directory.

**Core Database & Supabase Variables:**
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase API URL (e.g., `http://127.0.0.1:54321` for local).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Your Supabase Anon/Publishable key.
- `DATABASE_URL`: Connection string for PostgreSQL, used by Drizzle ORM (e.g., `postgresql://postgres:postgres@127.0.0.1:54322/postgres` for local).

**Optional / Third-Party Services:**
- `SENTRY_AUTH_TOKEN`: Used for uploading source maps to Sentry (primarily needed in CI/CD).

### Installation & Local Development

1. **Install Dependencies:**
   ```bash
   pnpm install
   ```

2. **Start the Local Environment:**
   Run the following command from the root directory. It starts every workspace's dev server in parallel. For `apps/web` this includes starting the local Supabase container, running Drizzle database migrations + seeding, and spinning up the Next.js development server; for `workers/docs-search` it starts Wrangler in local dev mode:
   ```bash
   pnpm run dev
   ```

3. **Access the App:**
   - Web App: [http://localhost:3000](http://localhost:3000)
   - Supabase Studio (Local): [http://localhost:54323](http://localhost:54323)

### Database Management
Database scripts are located in `apps/web` but can be run via pnpm filters or directly inside the app directory:
- `pnpm --filter @poketistix/app run db:generate` - Generate Drizzle migrations
- `pnpm --filter @poketistix/app run db:migrate` - Apply migrations to the database (defaults to local database via `.env.local`)
- `pnpm --filter @poketistix/app run db:push` - Push schema directly to the database
- `pnpm --filter @poketistix/app run db:seed` - Seed the database with initial data
- `pnpm --filter @poketistix/app run db:setup:local` - Migrate + seed in one step (runs automatically via `pnpm run dev`)
- `pnpm --filter @poketistix/app run db:reset:local` - Reset the local Supabase database and re-apply migrations

#### Docs Search Index (Cloudflare D1)
- `pnpm --filter @poketistix/app run d1:migrate` - Apply D1 migrations for the docs database
- `pnpm --filter @poketistix/app run d1:index` - Index docs content into D1 (used by `workers/docs-search`)

#### Production Database Migration
To apply migrations to the production database from your local machine, run the migration script with `NODE_ENV=production` so that it uses the production environment variables (`.env.production`), or pass the `DATABASE_URL` explicitly.

**Option A: Using Vercel CLI (Recommended)**
```bash
# 1. Pull production variables
vercel env pull .env.production

# 2. Run migration pointing to production
# (Windows PowerShell)
$env:NODE_ENV="production"; pnpm --filter @poketistix/app run db:migrate

# (macOS/Linux)
NODE_ENV=production pnpm --filter @poketistix/app run db:migrate
```

**Option B: Using direct DATABASE_URL**
```bash
# (Windows PowerShell)
$env:DATABASE_URL="<YOUR_PROD_URL>"; pnpm --filter @poketistix/app run db:migrate

# (macOS/Linux)
DATABASE_URL="<YOUR_PROD_URL>" pnpm --filter @poketistix/app run db:migrate
```

---

## 🧪 Development

Common commands run from the repository root (they recurse into all workspaces via `pnpm -r`):

- `pnpm test` - Run Vitest suites
- `pnpm lint` - Lint with `oxlint` (type-aware)
- `pnpm fmt` - Format with `oxfmt`
- `pnpm check` - Typecheck (`tsc --noEmit`)
- `pnpm --filter @poketistix/app run i18n:check` - Verify translation keys

---

## 📦 Release Cycle

This repository uses [Changesets](https://github.com/changesets/changesets) and GitHub Actions to automate versioning, changelogs, and package publishing.

### 1. Documenting Changes
Whenever you make a change that requires a version bump (patch, minor, or major), generate a changeset:
```bash
pnpm changeset
```
Follow the CLI prompts to select which packages to bump and provide a description of your changes. This will create a markdown file in the `.changeset` directory.

### 2. Committing
Commit the generated `.changeset/*.md` file along with your code changes and push to your branch.

### 3. Automated Release Process
When changes are merged into the `main` branch, the **Changesets GitHub Action** (`.github/workflows/changesets.yml`) takes over:
- It runs `pnpm turbo run version` to consume the changeset files and bump the `package.json` versions.
- It updates the `CHANGELOG.md` files.
- It creates a new Release and Tag on GitHub.
