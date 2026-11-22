<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# FlowTrace project instructions

## Sources and scope

- Read [PRD](docs/prd.md) for requirements and acceptance criteria, [architecture](docs/architecture.md) for component boundaries and data contracts, [workflow](docs/workflow.md) for system flows and development rules, and [roadmap](docs/traceai-roadmap.md) for task order.
- Before implementing, inspect the worktree and Git history against the roadmap. Report the week, day, last completed task, and exact next incomplete task. Account for partial work and unfinished prerequisites even when later features already exist.
- Work on one task at a time and preserve existing work. Run the checks that prove the task's acceptance criteria before checking its roadmap box. Report any blocker or unverified criterion.

## Architecture and coding

- Run workspace commands from this directory. Use pnpm workspaces, Turborepo, strict TypeScript, ESLint, and Prettier. Check the package scripts for the commands available at the current milestone.
- Keep the Next.js App Router UI on Tailwind and shadcn/ui. Use React Flow for the canvas, Zustand for editor state, and TanStack Query for server state. Use Fastify and Zod for API boundaries, return problem+json errors, and enforce workspace scoping and role checks.
- Keep graph validation and node schemas reusable across the editor and API. Use the shared node schema and executor contract. Draft graphs are editable and published workflow versions are immutable.
- Keep execution state in PostgreSQL through Drizzle. Use conditional state updates, lock the run row while advancing, and enqueue BullMQ jobs after commit. Preserve idempotency under retries and worker crashes. Apply backward-compatible migrations using expand, migrate, contract.
- Keep tracing asynchronous and best-effort. Use OpenTelemetry and the GenAI conventions, Redis Streams for buffering, ClickHouse for trace analytics, and S3 or local MinIO for large payloads. Decrypt credentials only in worker memory, sandbox code nodes, and mock side effects by default in replay and evals.

## Verification and contribution

- Run relevant lint, type checks, and Vitest suites. Use table-driven engine cases and cover scheduling invariants, including terminal states and single completion. The PRD sets at least 85% unit coverage for engine scheduling logic.
- Test node executors with mocked external services. Use Docker Compose for integration tests and Playwright for core journeys. Follow the roadmap for property, load, and crash-recovery testing.
- Keep main deployable. Use feature, fix, or chore branches, Conventional Commits, and a PR to merge. Reference PRD requirement IDs, cover new paths with relevant tests and telemetry, document changed flows, and attach a screenshot or GIF for UI changes.
