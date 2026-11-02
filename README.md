# TraceAI

Build, run, monitor and debug AI workflows.

TraceAI is a workflow platform where you design an AI workflow as a graph of nodes, run it, and trace every step: inputs, outputs, cost and errors.

> **Status:** early development. Auth, the database layer and the web app shell are working. The workflow canvas, run engine and tracing are being built next.

## What works today

- Monorepo with pnpm and Turborepo
- Postgres database with Drizzle ORM and migrations
- Fastify API with signup, login, refresh and logout (argon2 password hashing, JWT access token, httpOnly refresh cookie)
- Auth integration tests (Vitest)
- Next.js web app with login, signup and workflow list pages, connected to the API through a typed client and TanStack Query

## Tech stack

| Area | Tools |
| --- | --- |
| Monorepo | pnpm, Turborepo |
| Web | Next.js, React, Tailwind CSS, shadcn/ui, TanStack Query |
| API | Fastify, Zod, argon2, JWT |
| Database | Postgres (pgvector), Drizzle ORM |
| Infra (local) | Docker Compose: Postgres, Redis, ClickHouse, MinIO |
| Quality | TypeScript (strict), ESLint, Prettier, Vitest |

## Project structure

```
traceai/
  apps/
    web/        Next.js frontend         (http://localhost:3000)
    api/        Fastify backend          (http://localhost:4000)
  packages/
    db/         Drizzle schema and migrations
```

## Prerequisites

- Node.js 22 or newer
- pnpm (this repo pins its version in `package.json`, so Corepack will pick it up)
- Docker Desktop, running

## Run it locally

### 1. Install dependencies

```bash
pnpm install
```

### 2. Create your environment file

Copy the example file and fill in the values.

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Set at least these values in `.env`:

- `DATABASE_URL`: connection string for the local Postgres container
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`: two different long random strings

The web app needs one extra file, `apps/web/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

### 3. Start the infrastructure

Make sure Docker Desktop is running, then:

```bash
pnpm infra:up
```

This starts Postgres, Redis, ClickHouse and MinIO. Check that they are up:

```bash
docker compose ps
```

### 4. Create the database tables

```bash
pnpm db:migrate
```

Optionally add demo data:

```bash
pnpm db:seed
```

### 5. Start the API and the web app

Use two terminals.

Terminal 1, API:

```bash
pnpm --filter '@traceai/api' dev
```

Terminal 2, web app:

```bash
pnpm --filter '@traceai/web' dev
```

Open http://localhost:3000. Sign up for an account, log in, and you will land on the workflow list.

## Useful commands

| Command | What it does |
| --- | --- |
| `pnpm lint` | Lint every package |
| `pnpm --filter '@traceai/api' typecheck` | Type-check the API |
| `pnpm --filter '@traceai/web' exec tsc --noEmit` | Type-check the web app |
| `pnpm --filter '@traceai/api' test` | Run the auth integration tests (needs Postgres running) |
| `pnpm --filter '@traceai/web' build` | Production build of the web app |

## Troubleshooting

**The API returns 500 and the logs say `ECONNREFUSED` on port 5433.**
Postgres is not running. Start Docker Desktop, run `pnpm infra:up`, wait a few seconds, and try again.

**The browser shows a CORS error.**
The API only allows requests from `http://localhost:3000`. Make sure the web app runs on that port, and that the API was restarted after any change to its CORS settings.

**`relation "users" does not exist`.**
The tables have not been created. Run `pnpm db:migrate`.

**Tests fail with a connection error.**
The auth tests use the real database. Start the infrastructure first (step 3).

## Roadmap

1. Workflow canvas: drag nodes, connect them, edit node settings, autosave
2. Run engine: compile the graph and run it step by step, with mock and real LLM providers
3. Tracing: live node status, node inspector, span timeline
4. Replay and evals: re-run a step with changes, compare results, gate publishing on eval scores
5. Templates, demo and deployment

## License

To be decided.
