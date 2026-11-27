# TraceAI: Project Context

**Purpose of this file:** one place that explains what TraceAI is, how it is designed, what is already built, and where the code differs from the design documents. Read this first, then go to the detailed docs.

**Last updated:** November 2026
**Detailed docs:** [`prd.md`](./prd.md) (requirements), [`architecture.md`](./architecture.md) (design), [`workflow.md`](./workflow.md) (user journeys, system flows, dev workflow), [numbered roadmap](./traceai-roadmap-numbered%20.md)

> The PRD calls the product "AI Workflow Automation & Observability Platform (name TBD)". The repository and the code use the name **TraceAI**.

---

## 1. What TraceAI is

A single platform to **build AI workflows visually, run them reliably, and monitor, debug and improve every run**.

```
Build → Run → Observe → Debug → Improve
```

The closed loop that makes it different from workflow builders (n8n, Langflow, Dify) and LLM observability tools (Langfuse, LangSmith):

**build → run → trace → replay → eval → gated publish**, all inside one product, on top of a durable execution engine.

### Who it is for
| Persona | Need |
|---|---|
| Builder Dev (primary) | Prototype AI pipelines fast, run them reliably, debug a failure in under a minute |
| AI Engineer (primary) | Compare prompt/model versions on a dataset and ship the better one with evidence |
| Ops / Automation Operator (secondary) | Build from a template, get alerted on failures, understand errors |

### Goals (v1)
1. **Visual building** without code (code nodes for advanced users)
2. **Reliable execution**: survives worker crashes, API failures, long waits, with no lost progress and no duplicated side effects
3. **Full observability**: every run and step traced (input, output, prompt, model, tokens, cost, latency, error)
4. **Fast debugging**: from a failed run to a replayed step in seconds
5. **Verified improvement**: datasets, evals, version comparison, publish gates
6. **Engineering proof**: benchmarks and chaos tests published in the repo

### Not in v1
Hundreds of integrations, a node marketplace, mobile apps, on-prem/SSO/SOC 2, model training, billing, real-time multi-user co-editing.

---

## 2. Core concepts

| Term | Meaning |
|---|---|
| **Workspace** | Top-level container for workflows, credentials, datasets, members |
| **Workflow** | A directed graph of nodes and edges |
| **Workflow version** | Immutable snapshot of a graph. One version is "published" |
| **Draft graph** | The graph being edited. Autosaved in `workflows.draft_graph` |
| **Node / Edge** | One unit of work / a connection between nodes |
| **Trigger** | What starts a run: manual, webhook, schedule, API |
| **Run / Step** | One execution of a workflow version / one execution of one node inside a run |
| **Trace / Span** | Observability record of a run / one timed operation inside it |
| **Credential** | Encrypted secret used by nodes |
| **Dataset / Eval / Scorer** | Test inputs / running a version against a dataset / a function that grades an output |
| **Replay** | Re-executing a past step with its original input, optionally with edited config |
| **Publish gate** | Rule that blocks publishing when eval scores drop below a threshold |

---

## 3. Architecture at a glance

### Principles
1. **PostgreSQL is the source of truth for execution state.** Redis only delivers work. Any job can be lost and the system still recovers.
2. **Execution and observability are decoupled.** Tracing is asynchronous and can never fail or slow a run.
3. **Stateless services scale horizontally** (API, workers, ingest).
4. **One node interface.** Every node is a schema plus an executor.
5. **Safe by default.** Credentials are decrypted only in workers, code runs in a sandbox, replays mock side effects.
6. **Measurable.** Every claim is backed by a reproducible benchmark.

### Services (target design)
| Service | Responsibility |
|---|---|
| `web` | Next.js UI: canvas, run views, trace viewer, dashboards, datasets, evals |
| `api` | Fastify REST API, auth, RBAC, workflow CRUD, run creation, webhooks, replay, evals, WebSocket gateway |
| `worker` | Pulls step jobs from BullMQ, runs node executors, persists state, advances runs, emits spans |
| `scheduler` | Cron triggers (leader-elected), reconciler, alert evaluator, retention jobs |
| `ingest` + trace writer | OTLP receiver, PII redaction, cost calculation, Redis Streams to ClickHouse |
| `python-sandbox` (P2) | Python code nodes in gVisor containers |

### Tech stack
| Layer | Choice |
|---|---|
| Language | TypeScript (strict) everywhere |
| Monorepo | pnpm workspaces + Turborepo |
| Frontend | Next.js (App Router), React, Tailwind, shadcn/ui, TanStack Query, Zustand |
| Canvas / editors | React Flow (`@xyflow/react`), Monaco |
| API | Fastify + Zod |
| Database | PostgreSQL + pgvector, Drizzle ORM + drizzle-kit |
| Queue | BullMQ on Redis |
| Trace store | ClickHouse, fed through Redis Streams |
| Object storage | S3 (MinIO locally) |
| Telemetry | OpenTelemetry (OTLP/HTTP) with GenAI semantic conventions |
| Sandbox | isolated-vm (JS), Docker + gVisor (Python, P2) |
| Testing | Vitest, Playwright, k6, fast-check |
| Platform metrics | prom-client, Prometheus, Grafana |
| CI / deploy | GitHub Actions, Docker Compose, AWS reference (or a VPS with Caddy) |

---

## 4. Repository layout

### Target layout (from `architecture.md`)
```
apps/        web, api, worker, scheduler, ingest
packages/    engine, nodes, llm, db, clickhouse, telemetry, sandbox, crypto, shared, sdk-ts, ui
infra/       docker, compose, terraform, grafana
bench/       k6, chaos, ingest
docs/        prd.md, workflow.md, architecture.md, ADRs, benchmark reports
.github/     workflows (CI)
```

### What exists today
The git root is `TraceAI/`. The project lives in `TraceAI/traceai/`. The CI file is `TraceAI/.github/workflows/ci.yml` and uses `working-directory: traceai`.

| Path | State |
|---|---|
| `apps/web` | **Built (editor part).** Login, signup, workflow list, workflow editor with autosave |
| `apps/api` | **Built (auth and workflow CRUD).** Everything is in `src/server.ts` for now |
| `packages/db` | **Built.** Drizzle schema, migrations, seed |
| `packages/nodes` | **Built.** Node definitions, config schemas, shared graph validator, expression hints |
| `packages/engine` | **Started.** Types, step error helpers, graph compiler, expression resolver, and BullMQ dispatcher |
| `apps/worker` | **Started.** Step claims, Redis graph cache, guarded run startup, and basic scheduling after step completion |
| `apps/scheduler`, `apps/ingest` | Not created yet |
| `packages/llm`, `clickhouse`, `telemetry`, `sandbox`, `crypto`, `shared` | Folders exist, no code yet |

---

## 5. Data model (summary)

Full column lists are in `architecture.md` section 4. The shape:

```
users ─< memberships >─ workspaces ─< workflows ─< workflow_versions ─< runs ─< step_runs
                                   ─< credentials, api_keys, datasets, knowledge_bases, alert_rules
workflows ─< triggers          datasets ─< dataset_items, eval_runs ─< eval_results
```

Key rules:
- `step_runs` has `unique(run_id, node_id, iteration)`. This is what stops a step from being recorded twice.
- Run statuses: `queued, running, waiting, succeeded, failed, cancelled, timed_out`.
- Step statuses: `pending, queued, running, retrying, waiting, succeeded, failed, skipped, cancelled`.
- Run modes: `production, test, replay, eval`.
- Every transition is one conditional `UPDATE ... WHERE status = <expected>`. If the expected status does not match, the transition is rejected.
- Credentials use envelope encryption (AES-256-GCM). Values are never returned by the API.
- Large outputs (over 256 KB) are stored in S3 with a pointer.

Observability data (spans) lives in **ClickHouse** because it is append-only and aggregate-heavy. Execution state lives in **PostgreSQL** because it needs transactions and row locks.

---

## 6. Execution engine design

### Run creation
In one transaction: insert the run, insert a `step_runs` row for every node (`pending`), mark the trigger step `succeeded`, mark nodes whose dependencies are satisfied as `queued`. After `COMMIT`, enqueue BullMQ jobs with `jobId = runId:nodeId:iteration:attempt`. Return `202 { runId }`.

### Step execution (worker)
1. Claim: `UPDATE step_runs SET status='running', lease_expires_at=now()+60s WHERE id=$1 AND status='queued' RETURNING *`. Zero rows means someone else owns it.
2. Load the compiled graph (Redis cache) and upstream outputs. Resolve `{{ }}` expressions into an input snapshot.
3. Run the executor with a timeout (`AbortSignal`).
4. In one transaction: mark the step terminal, call `advance()`, commit. Then enqueue newly ready steps and publish live events.

### `advance()`
Runs inside the step-completion transaction, with `SELECT ... FOR UPDATE` on the run row so two branches finishing together cannot both schedule a merge node. It marks children `queued` when their parents are satisfied, propagates `skipped` for branches not taken, applies Merge `all`/`any`, and sets the final run status.
- `continueOnError = false`: the run fails and remaining steps are cancelled.
- `continueOnError = true`: the step is `failed`, its output is `{ error }`, and downstream continues.

### Retries
Retryable: network errors, timeouts, HTTP 408/425/429/5xx, provider overload. Not retryable: validation errors, other 4xx, auth errors, sandbox errors. Backoff is exponential with jitter and respects `Retry-After`. Every attempt is its own span.

### Crash recovery (three layers)
1. BullMQ stalled-job detection
2. Claim check (completed steps are never re-run)
3. Reconciler every 30 s: re-enqueue `queued` steps with no job, reset `running` steps whose lease expired, enqueue due delays, time out runs past `max_duration`

### Guarantees
**At-least-once execution, exactly-once state transitions, plus idempotency keys.** Exactly-once side effects across external APIs are not claimed (ADR-9).

### Other decisions
- DAG with explicit Loop nodes, no arbitrary cycles (ADR-8)
- Safe-mode replay mocks side effects by default (ADR-7)
- Engine written in TypeScript first, isolated in `packages/engine` so the scheduler core could move to Go later (ADR-2)
- `isolated-vm` for JavaScript nodes, because Node `vm` is not a security boundary (ADR-6)
- SSRF guard on the HTTP node: resolve DNS, block private, loopback and link-local ranges, re-check at connect time

### Expressions
`{{ }}` is resolved by a small safe resolver, **no `eval`**. Allowed functions: `json`, `upper`, `lower`, `length`, `default`, `now`.

---

## 7. Observability design (summary)

One trace per run, one span per step, child spans for LLM, tool and HTTP calls, following OpenTelemetry with GenAI attributes (model, tokens, finish reason). Spans go to the ingest service (redaction, cost from `model_pricing`), into a Redis Stream, then a batch writer inserts into ClickHouse (batches of 10k rows or 1 s, dead-letter queue after 5 failures). Live UI updates use Redis Pub/Sub on `run:{runId}` and a WebSocket gateway.

---

## 8. Security (summary)

- Access JWT (15 min) plus a rotating refresh token in an httpOnly cookie. Workspace API keys store only a hash.
- Every query is scoped by `workspace_id`. Role checks (owner, editor, viewer) in a Fastify `preHandler`.
- Credentials decrypted only inside worker memory. Auth headers are stripped from spans.
- Zod on every endpoint, body size limits, rate limits on public endpoints.
- Code nodes run in a sandbox with memory and time limits and no network or filesystem access.

---

## 9. Roadmap progress

Source: [numbered roadmap](./traceai-roadmap-numbered%20.md). Task numbers follow the original spreadsheet. Week and day labels below provide context.

| Week | Day | Status |
|---|---|---|
| **1** | 1. Monorepo, TypeScript/ESLint/Prettier/Vitest, Git conventions | Done |
| | 2. Docker Compose, `.env.example`, scripts, container check | Done |
| | 3. Drizzle, tables, indexes, seed | Done |
| | 4. Fastify, auth, workspace role check, auth integration tests | Done |
| | 5. Next.js + Tailwind + shadcn/ui, login/signup/list pages, typed API client + TanStack Query | Done |
| | 6. GitHub Actions, README, catch up | **Partial.** CI runs lint, typecheck and web build. API integration tests are not in CI yet. README done |
| **2** | 1. React Flow canvas, Zustand store, shortcuts | Done |
| | 2. Node palette, drag and drop, custom node, connection rules | Done |
| | 3. `NodeDefinition`, `GET /api/v1/nodes`, schema-driven config form, config panel | Done |
| | 4. Node schemas, Monaco, common settings, expression input | Done |
| | 5. Shared graph validator, rules, red badges and problems list | Done (the "missing credential" rule is skipped until credentials exist) |
| | 6. Autosave of `draft_graph`, reload check | Done in code with automated tests. Undo/redo skipped (optional) |
| **3** | 1. `NodeResult`/`ExecContext`/`StepError` types, compiler, compiler tests | Done (tasks 43–45) |
| | 2. Safe expression resolver and tests | Done (tasks 46–49) |
| | 3. Run creation, job dispatch, worker claims, graph cache, guarded transitions, and `advance()` | Done through task 56, including merge modes and skip propagation. Task 57 covers final run status and `continueOnError`. |
| | Remaining execution work | Final run status, `continueOnError`, and node executors are pending. |
| **4 to 8** | Reliability, security, live UI, tracing, metrics, replay, evals, proof, ship | Not started |

### Planned order for the demo
Finish the core path first: **build, run, trace, replay, eval, gated publish**. These can wait until the core path works end to end: retries and leases (Week 4 Day 1-3), metrics, alerts and Grafana (Week 6), chaos and benchmarks (Week 8), the blog post.

---

## 10. What is built today

### API (`apps/api`)
| Method and path | Purpose |
|---|---|
| `GET /health` | Health check |
| `POST /auth/signup`, `/auth/login`, `/auth/refresh`, `/auth/logout` | Auth. argon2 hashing, access JWT 15 min, refresh token 7 days in httpOnly cookie `traceai_refresh` (path `/auth`) |
| `GET /workspaces`, `POST /workspaces` | List and create workspaces (creator becomes owner) |
| `GET /workspaces/:workspaceId/access` | Membership and role check |
| `GET /api/v1/nodes` | Node catalog (type, label, description, category) |
| `POST /workspaces/:workspaceId/workflows` | Create workflow (empty draft) |
| `GET /workspaces/:workspaceId/workflows` | List workflows |
| `GET /workflows/:workflowId` | Read a workflow |
| `PATCH /workflows/:workflowId/draft` | Save the draft graph (shape check, max 500 nodes and 2000 edges) |
| `POST /api/v1/workflows/:workflowId/runs` | Create a run and its steps from a workflow version, then dispatch ready steps after commit |

Access rules: a workflow of another workspace answers `404` (its existence is not revealed). Listing or creating in a workspace you are not in answers `403`.

CORS allows `http://localhost:3000` with credentials and methods GET, POST, PUT, PATCH, DELETE.

### Web (`apps/web`)
| Route | What it does |
|---|---|
| `/login`, `/signup` | Forms using `lib/api.ts` and TanStack Query mutations |
| `/workflows` | Lists workflows of the user's workspace (creates a first workspace if none), **New workflow** button |
| `/workflows/[workflowId]` | Editor: node palette, canvas, settings panel, autosave status |
| `/workflows/demo` | Early demo canvas without persistence |

Editor details:
- **Canvas:** pan, zoom, minimap, snap-to-grid (16 px), shortcuts (Delete, Ctrl+A, Ctrl+D), drag from palette, connection rules, problems list with click-to-focus.
- **Graph store (Zustand):** nodes, edges, selection, `addNode`, `duplicateSelected`, `updateNodeConfig`, `updateNodeSettings`, `loadGraph`.
- **Settings panel:** forms are generated from each node's Zod schema (`z.toJSONSchema` into `lib/config-fields.ts`). Monaco for `code` and `headers`. A Monaco-based expression editor with `{{ }}` autocomplete for `prompt`, `url`, `body`, `expression`. A "Common settings" section (timeout, retries, continue on error) for non-trigger nodes. Invalid values are still saved so the validator can flag them.
- **Autosave:** the store is watched, the graph is serialized without UI-only fields and without run status, saved with `PATCH` after 1 s of quiet, retried after 5 s on failure, and flushed on leaving the page. Save status shows in the editor.
- **API client (`lib/api.ts`):** access token kept in memory, refreshed from the httpOnly cookie on page load and on `401`.

### Worker (`apps/worker`)

The worker claims a queued step by run, node, and iteration. It loads the compiled graph through Redis and starts the run if the run is still queued. These database changes share a transaction, so a graph load failure rolls the claim back.

When a handler returns a result, `advance()` locks the run row and saves the result, including any selected branch. Pending steps are queued or skipped using the [workflow readiness rules](./workflow.md#b5-scheduling-algorithm-advance). The worker publishes new jobs to BullMQ after commit. Run creation uses the same rules to determine what the manual trigger can start. The default worker handler logs claims, and node executors are planned for task 61.

### Packages
- **`@traceai/db`:** tables `users`, `workspaces`, `memberships`, `workflows` (with `draft_graph`), `workflow_versions`, `workflow_runs`, `step_runs`. Run `pnpm db:migrate` to apply `0006_step_branch`, which adds the nullable branch column to existing databases. Seed script: `pnpm --filter @traceai/db seed`.
- **Run and step transitions:** `transitionRun` and `transitionStep` update a row only if its current status matches the expected status. A successful update returns the row with its new status and timestamps. Stale updates return `undefined`. Invalid transition pairs throw before writing.
- **`@traceai/nodes`** (source-only, web uses `transpilePackages`): `NodeDefinition` type, 7 node definitions (`manual-trigger`, `llm`, `condition`, `merge`, `delay`, `http`, `javascript`) with Zod config schemas, `commonSettingsSchema`, expression variable and function lists, and the **shared graph validator**.
- **`@traceai/engine`:** `NodeResult`, `ExecContext`, `StepError` types and `createStepError` / `describeStepError` helpers.

### Shared graph validator (`packages/nodes/src/graph-validator.ts`)
Used by the web app today and meant to be used by the API on save and publish.
- `getConnectionError(link, nodes, edges)` for live checks while drawing an edge.
- `validateGraph(graph)` returns every problem. Codes: `unknown-node-type`, `self-loop`, `trigger-incoming`, `cycle`, `no-trigger`, `disconnected`, `dangling-edge`, `invalid-config`, `invalid-json`, `bad-reference`.

### Tests
| Package | Tests |
|---|---|
| `apps/api` | Auth integration tests and workflow route tests (create, list, save, read back, overwrite, reject invalid, hide from other workspaces, login required). They run against the real database |
| `packages/nodes` | Graph validator tests |
| `packages/engine` | Step error helpers, graph compiler, expression resolver, and BullMQ dispatcher tests |
| `apps/worker` | Integration tests for claims, the graph cache, run-row locking, rollback, and one BullMQ job per newly ready child. |
| `apps/web` | Graph serialize round-trip tests |

---

## 11. Differences between the code and the design docs

The design docs describe the finished product. The code is earlier and some choices differ. **These need a decision before the compiler (Week 3 Day 1) and the run engine are built**, because the compiler reads the saved graph and the executors use these types.

| Area | Design docs | Code today | Suggested action |
|---|---|---|---|
| **Graph JSON** | `schemaVersion`, nodes with `type: "trigger.webhook"`, top-level `config` and `settings` | React Flow format: `type: "workflow"`, data in `node.data = { label, nodeType, config, settings }` | Add a conversion step in the compiler, or add `schemaVersion` and flatten on publish. Decide before Week 3 |
| **Node type ids** | `trigger.manual`, `ai.llm`, `logic.condition`, `action.http`, `code.javascript` | `manual-trigger`, `llm`, `condition`, `merge`, `delay`, `http`, `javascript` | Pick one scheme and migrate. Changing later breaks saved graphs |
| **Node categories** | lowercase `trigger, ai, logic, action, code, data, output` | `Triggers`, `AI`, `Logic`, `Actions` | Align when the node set grows |
| **`NodeDefinition`** | also has `outputSchema`, `sideEffect`, `credentialTypes`, `defaults`, `execute`, `mock` | `type`, `label`, `description`, `category`, `configSchema` only | Add the rest when executors are written |
| **`NodeResult`** | `kind: 'success' \| 'wait' \| 'error'`, with `branch` | `status: 'success' \| 'error' \| 'skipped'`, no `wait` | **Align `packages/engine/src/types.ts` with `architecture.md` section 7.1.** The `wait` result is required for Delay and approvals (durable waits) |
| **`ExecContext`** | has `stepId`, `credentials`, `idempotencyKey`, `tracer`, `logger` | has `attempt`, `iteration`, `settings`, `trigger`, `log`, no credentials or tracer | Align with section 7.1 |
| **Expression variables** | `{{trigger.body.message}}`, `{{nodes.classify.output.category}}` | autocomplete offers `input` and `trigger` only | Extend when the resolver (Week 3 Day 2) is built |
| **Table names** | `runs`, `step_runs` | `workflow_runs`, `step_runs` | Rename or keep, but update `architecture.md` |
| **`workflows` table** | `draft_graph`, `published_version_id`, `created_by` | `draft_graph`, `definition` (not null), no `published_version_id` | Replace `definition` with `published_version_id` when versions are built |
| **`workflow_versions`** | `graph`, `status`, `note`, `created_by` | `definition`, `version` | Rename to `graph` and add the missing columns |
| **Other tables** | `triggers`, `api_keys`, `credentials`, `approvals`, datasets, evals, alerts, `model_pricing`, `audit_logs` | Not created yet | Created as each feature arrives |
| **`workspaces`, `users`** | `slug`, `retention_days`, `citext` email, `avatar_url` | name only, plain `text` email | Add when needed |
| **API paths** | `/api/v1/auth/...`, `/api/v1/workspaces/...` | `/auth/...`, `/workspaces/...`, `/workflows/...`, only the node catalog is under `/api/v1` | Move everything under `/api/v1` before external users exist |
| **Env variables** | `JWT_SECRET` | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Update `architecture.md` section 13.3 |
| **PostgreSQL version** | 16 | local Compose uses `pgvector/pgvector:pg17`, port 5433 | Decide on one version for production |
| **Web node list** | one source (`@traceai/nodes`) | `apps/web/src/lib/node-catalog.ts` still keeps its own copy | Make the palette read from `@traceai/nodes` |
| **Save validation** | full validation on save and publish | `PATCH` checks shape and size only. `validateGraph` is not called by the API yet | Call `validateGraph` on publish (Week 5 Day 4) |

---

## 12. Conventions

### Git
- Conventional commits: `feat(web): ...`, `fix(api): ...`, `test(nodes): ...`, `chore: ...`, `docs: ...`.
- `main` is always deployable. Design docs ask for feature branches and pull requests even when working solo. Today work is committed directly to `main` in small commits.

### Quality gates before every commit
```bash
pnpm --filter '<package>' typecheck      # or: pnpm --filter '@traceai/web' exec tsc --noEmit
pnpm lint
pnpm --filter '<package>' test
```
CI runs a frozen dependency install, lint, type checks, and the web build on pushes to `main` and on pull requests. See the [README setup steps](../../README.md#1-install-dependencies) for how to update the workspace lockfile.

### Code rules
- TypeScript strict. **No `any`** (ESLint rejects it). Use `Record<string, unknown>` or a real type.
- Every node is a schema plus an executor behind one shared interface.
- Validation logic that both web and API need lives in `packages/nodes`, not in an app.
- Never let observability code fail or slow a run.

### Definition of done (from `workflow.md` D5)
Requirement IDs referenced, tests added, traces and metrics for new execution paths, docs updated when flows change, a demo GIF for UI changes.

---

## 13. Local development

Prerequisites: Node.js 22 or newer, pnpm, Docker Desktop (running).

```bash
pnpm install
cp .env.example .env            # Windows: Copy-Item .env.example .env
pnpm infra:up                   # Postgres, Redis, ClickHouse, MinIO
pnpm db:migrate
pnpm --filter @traceai/db seed  # optional demo data

pnpm --filter '@traceai/api' dev    # http://localhost:4000
pnpm --filter '@traceai/web' dev    # http://localhost:3000
```

`apps/web/.env.local` needs `NEXT_PUBLIC_API_URL=http://localhost:4000`.

| Service | Local port |
|---|---|
| Web | 3000 |
| API | 4000 |
| PostgreSQL | 5433 |
| Redis | 6379 |
| ClickHouse | 8123 (HTTP), 9000 (native) |
| MinIO | 9001 (console), 9002 (S3) |

Common problems:
- **API returns 500 with `ECONNREFUSED` on 5433:** Docker or Postgres is not running.
- **Tests time out on the first run:** containers just started, the database is still waking up.
- **A migration fails with only `exit code 1`:** run the SQL by hand with `psql` to see the real error. Making a migration idempotent (`IF NOT EXISTS`) makes it safe to re-run.

---

## 14. Next steps

1. **Settle the differences in section 11**, at least the graph format, node type ids, and the `NodeResult`/`ExecContext` types.
2. **Add final run status and `continueOnError`** to `advance()` (task 57).
3. **LLM adapter** with a mock provider first, one real provider second, then the executors (LLM, Condition, HTTP, Merge, JavaScript).
4. **Run a real workflow end to end** through the API. Then live status on the canvas, the node inspector, tracing, replay, evals, gated publish.
5. **Finish the CI gap:** run the API integration tests in GitHub Actions (needs a Postgres service and migrations).

---

## 15. Document index

| Document | Read it for |
|---|---|
| [`prd.md`](./prd.md) | Problem, personas, glossary, requirement IDs (B-, E-, O-, D-, PL-), user stories, NFR targets, risks |
| [`architecture.md`](./architecture.md) | Services, tech stack, data model, Redis usage, engine design, API list, security, deployment, failure modes, ADRs, benchmark plan |
| [`workflow.md`](./workflow.md) | User journeys, run and step state machines, `advance()`, retry, crash recovery, tracing pipeline, replay, evals, development workflow |
| [Numbered roadmap](./traceai-roadmap-numbered%20.md) | Implementation tasks in order |
| `context.md` (this file) | The shortest accurate picture of the project and its current state |
