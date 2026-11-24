# Product Requirements Document (PRD)

**Product:** AI Workflow Automation & Observability Platform (working title — name TBD)
**Document owner:** Vumika
**Status:** Draft v1.0
**Last updated:** October 2026

---

## 1. Overview

### 1.1 One-line summary

A single platform to **visually build AI workflows and agents, run them reliably on a durable execution engine, and monitor, debug, and improve every run** — covering the full lifecycle: **Build → Run → Observe → Debug → Improve**.

### 1.2 Background

AI automation has moved from single prompts to multi-step workflows: an LLM classifies a ticket, a tool fetches data, another LLM drafts a reply, a condition routes it, an API sends it. Teams building these face three gaps at once:

1. Building them needs a lot of custom glue code.
2. Running them reliably (retries, crashes, rate limits, long waits) is hard.
3. Debugging them is guesswork — when an output is wrong or a run is expensive, there is no clear view of what happened inside.

Today these problems are solved by **separate tools**: workflow builders (n8n, Zapier, Langflow, Dify, Flowise) and LLM observability tools (Langfuse, LangSmith, Helicone, Arize Phoenix). No single product connects "this run failed" directly to "fixed, verified, and redeployed".

### 1.3 Vision

Make AI workflows as **buildable, reliable, and debuggable** as normal software — in one place.

---

## 2. Problem Statement

| # | Problem | Who feels it | Impact |
|---|---------|--------------|--------|
| P1 | Building multi-step AI automations requires custom code connecting LLMs, tools, APIs, and data | Developers, technical operators | Slow to build, hard to change, non-developers locked out |
| P2 | Long-running workflows fail mid-way (API down, server crash, rate limit, timeout) | Anyone running workflows in production | Lost work, duplicated side effects (e.g., email sent twice), wasted LLM spend |
| P3 | No visibility into what happened inside a run — which step failed, what prompt was sent, what the model returned, what it cost | Developers debugging AI behavior | Debugging takes minutes to hours of guesswork |
| P4 | Prompt/model changes silently break quality; no way to verify a fix before shipping | Developers iterating on AI workflows | Regressions reach production unnoticed |
| P5 | Building and monitoring live in different tools | Teams using AI in production | Context switching, no direct path from failure → fix → verification |

---

## 3. Goals and Non-Goals

### 3.1 Goals

- **G1 — Visual building:** Users can build a working AI workflow on a canvas without writing code (code nodes available for advanced users).
- **G2 — Reliable execution:** Workflows survive worker crashes, transient API failures, and long waits without losing progress or duplicating side effects.
- **G3 — Full observability:** Every run and every step is automatically traced — inputs, outputs, prompts, model, tokens, cost, latency, errors.
- **G4 — Fast debugging:** From any failed run, a user can find the broken step, edit it, and replay it in seconds.
- **G5 — Verified improvement:** Users can turn real runs into test datasets, run evals, compare versions, and block publishing when quality drops.
- **G6 — Engineering proof:** The system is benchmarked (throughput, latency, recovery) and the results are published in the repo.

### 3.2 Non-Goals (for v1)

- Hundreds of third-party integrations (v1 ships a focused set of ~15 nodes).
- A marketplace for community nodes/templates.
- Mobile apps.
- On-premise enterprise deployment, SSO/SAML, SOC 2 compliance.
- Training or fine-tuning models.
- Billing and paid plans.
- Real-time multi-user co-editing of the same workflow (single editor + version history in v1).

---

## 4. Target Users and Personas

### Persona A — "Builder Dev" (primary)
- Full-stack or backend developer adding AI features to a product.
- Wants to prototype AI pipelines fast, then run them reliably in production.
- Pain: glue code, flaky LLM calls, no visibility.
- Success: builds a workflow in under 30 minutes, debugs a failure in under 1 minute.

### Persona B — "AI Engineer" (primary)
- Iterates on prompts, models, and agents.
- Pain: can't tell if a prompt change made things better or worse; can't see cost breakdowns.
- Success: compares two prompt versions on a dataset and ships the better one with evidence.

### Persona C — "Ops / Automation Operator" (secondary)
- Semi-technical; automates business processes (support triage, lead enrichment, report generation).
- Pain: can't code complex logic; doesn't know why automations fail.
- Success: builds from a template, gets alerted on failures, understands the error.

---

## 5. Core Concepts (Glossary)

| Term | Definition |
|------|------------|
| **Workspace** | Top-level container for workflows, credentials, datasets, members |
| **Workflow** | A directed graph of nodes and edges that performs an automation |
| **Workflow Version** | An immutable snapshot of a workflow graph; one version is "published" |
| **Node** | One unit of work (LLM call, HTTP request, condition, code, etc.) |
| **Edge** | A connection that passes data/control from one node to another |
| **Trigger** | What starts a run: webhook, schedule (cron), manual, API |
| **Run** | One execution of a workflow version |
| **Step** | One execution of one node inside a run (a node inside a loop can have many steps) |
| **Trace** | The full observability record of a run (one trace per run) |
| **Span** | One timed operation inside a trace (step, LLM call, tool call, HTTP call) |
| **Credential** | Encrypted secret (API key, OAuth token) used by nodes |
| **Dataset** | A collection of input (and optional expected output) items used for evals |
| **Eval** | Running a workflow version or node against a dataset and scoring the outputs |
| **Scorer** | A function that grades an output (exact match, regex, JSON schema, LLM-as-judge) |
| **Replay** | Re-executing a past step (or run) with its original inputs, optionally with edited config |
| **Publish gate** | Rule that blocks publishing a new version if its eval scores fall below a threshold |

---

## 6. Functional Requirements

Priority key: **P0** = must have for v1 · **P1** = should have for v1 · **P2** = later

### 6.1 Module 1 — Visual Workflow Builder

| ID | Requirement | Priority |
|----|-------------|----------|
| B-01 | Infinite canvas with pan, zoom, minimap, snap-to-grid | P0 |
| B-02 | Drag nodes from a categorized node library onto the canvas | P0 |
| B-03 | Connect nodes with edges; validate connections (type-compatible ports, no illegal cycles) | P0 |
| B-04 | Node configuration side panel with forms generated from each node's schema | P0 |
| B-05 | Variable/expression system: reference upstream outputs, e.g. `{{nodes.classify.output.category}}`, with autocomplete | P0 |
| B-06 | Graph validation before save/run: missing required fields, disconnected nodes, invalid references, missing credentials | P0 |
| B-07 | Autosave drafts; explicit "Publish" creates an immutable version | P0 |
| B-08 | Version history: list, view, diff (graph + config), restore as new draft | P1 |
| B-09 | Undo/redo, copy/paste, multi-select, keyboard shortcuts | P1 |
| B-10 | "Test run" from the editor with a sample input; results shown inline on each node | P0 |
| B-11 | Pin sample data on a node to test downstream nodes without re-running upstream | P1 |
| B-12 | Templates gallery (5–8 starter workflows) | P1 |
| B-13 | Import/export workflow as JSON | P1 |
| B-14 | Sticky notes / comments on canvas | P2 |
| B-15 | AI assistant: "describe the workflow in text → generate a draft graph" | P2 |

### 6.2 Node Library (v1)

| Category | Node | Description | Priority |
|----------|------|-------------|----------|
| Trigger | Manual | Run from UI or API with JSON input | P0 |
| Trigger | Webhook | Unique URL; request body becomes run input | P0 |
| Trigger | Schedule | Cron expression with timezone | P0 |
| AI | LLM | Prompt template, model/provider choice, temperature, max tokens, JSON-mode / structured output schema | P0 |
| AI | Agent | LLM with tool calling; tools = other nodes or HTTP tools; max iterations; stop conditions | P1 |
| AI | Classifier | LLM-based classification into user-defined labels | P1 |
| AI | Extractor | Extract structured fields from text into a JSON schema | P1 |
| AI | Knowledge Retrieval (RAG) | Query a workspace knowledge base (pgvector) and return top-k chunks | P1 |
| AI | Embeddings | Generate embeddings for text | P2 |
| Logic | Condition (If/Else) | Route based on expression result | P0 |
| Logic | Switch | Route to one of N branches | P1 |
| Logic | Loop (For Each) | Iterate over an array; runs a sub-graph per item; configurable concurrency | P1 |
| Logic | Merge | Wait for branches; mode = all / any | P0 |
| Logic | Delay | Wait for a duration or until a time | P0 |
| Logic | Human Approval | Pause until approved/rejected via UI, link, or API | P1 |
| Action | HTTP Request | Method, URL, headers, body, auth via credential; retries; response parsing | P0 |
| Action | Send Email | Via SMTP/Resend credential | P1 |
| Action | Slack Message | Post to channel via webhook/bot token | P1 |
| Action | Google Sheets | Append/read rows | P2 |
| Action | Postgres Query | Parameterized query against a user database | P2 |
| Code | JavaScript | Sandboxed JS with access to inputs; returns JSON | P0 |
| Code | Python | Sandboxed Python in isolated container | P2 |
| Data | Transform | Map/filter/pick fields with expressions (no code) | P1 |
| Output | Respond to Webhook | Return a custom response to the webhook caller | P1 |

**Common node settings (all nodes):** name, description, timeout, retry policy (max attempts, backoff type, base delay), "continue on error" toggle, and an idempotency-key template for side-effect nodes.

### 6.3 Module 2 — Durable Execution Engine

| ID | Requirement | Priority |
|----|-------------|----------|
| E-01 | Execute a workflow version as a DAG in dependency order | P0 |
| E-02 | Run independent branches in parallel | P0 |
| E-03 | Persist each step's state (status, input snapshot, output, error, timings) before scheduling the next | P0 |
| E-04 | Crash recovery: if a worker dies, in-flight steps are re-queued and the run resumes; completed steps are never re-executed | P0 |
| E-05 | Per-node retry with fixed/exponential backoff and jitter; distinguish retryable vs non-retryable errors | P0 |
| E-06 | Per-node timeout and per-run max duration | P0 |
| E-07 | Idempotency: each step execution has a deterministic key; side-effect nodes pass idempotency keys to external APIs where supported | P0 |
| E-08 | Conditional branching with skip propagation for untaken branches | P0 |
| E-09 | Merge semantics (wait-all / wait-any) | P0 |
| E-10 | Durable waits: Delay and Human Approval release the worker and resume later (minutes to days) | P0 / P1 |
| E-11 | Loops with per-item steps and configurable concurrency | P1 |
| E-12 | Run cancellation (graceful: stop scheduling, mark in-flight as cancelled when they finish) | P0 |
| E-13 | Concurrency limits: per workspace and per workflow | P1 |
| E-14 | Provider rate limiting (e.g., max LLM requests/min per credential) | P1 |
| E-15 | Large payload handling: outputs above a size threshold stored in object storage with a pointer | P1 |
| E-16 | Live run streaming: step status changes pushed to the UI in real time | P0 |
| E-17 | Re-run a full run with the same input on the same or a newer version | P0 |
| E-18 | Sub-workflow node (call another workflow as a step) | P2 |

### 6.4 Module 3 — Observability

| ID | Requirement | Priority |
|----|-------------|----------|
| O-01 | Automatic tracing: one trace per run, one span per step, child spans for LLM/tool/HTTP calls — no user setup | P0 |
| O-02 | Capture for LLM spans: provider, model, prompt (messages), response, input/output tokens, cost, latency, finish reason, errors | P0 |
| O-03 | Traces follow OpenTelemetry, with GenAI semantic convention attributes for AI spans | P0 |
| O-04 | Trace viewer: waterfall/timeline + tree view; click any span to see inputs, outputs, metadata, errors | P0 |
| O-05 | Runs list with filters: workflow, version, status, trigger type, date range, duration, cost, error text | P0 |
| O-06 | Full-text search across span inputs/outputs | P1 |
| O-07 | Dashboards: runs over time, success rate, p50/p95/p99 latency, cost per day / workflow / model, token usage, top failing nodes, slowest nodes | P0 |
| O-08 | Cost calculation from a maintained model-pricing table (per 1M input/output tokens) | P0 |
| O-09 | Alerts: rules on error rate, cost, latency, run failure; channels Slack / email / webhook; cooldown and dedup | P1 |
| O-10 | PII redaction: configurable masking (emails, phone numbers, card-like numbers, custom regex) before storage | P1 |
| O-11 | Data retention: configurable TTL per workspace (default 30 days) | P1 |
| O-12 | External SDK (TypeScript + Python) to send traces from code outside the platform | P2 |

### 6.5 Module 4 — Debug & Improve Loop (key differentiator)

| ID | Requirement | Priority |
|----|-------------|----------|
| D-01 | From a failed run, jump directly to the failing step, with the error, input, and config shown | P0 |
| D-02 | **Step replay:** re-execute one step with its original input snapshot; optionally edit config/prompt before replaying | P0 |
| D-03 | Replay runs in **safe mode** by default: side-effect nodes (email, Slack, HTTP POST/PUT/DELETE) are mocked unless explicitly enabled | P0 |
| D-04 | "Replay from here": resume a run from a chosen step using stored upstream outputs | P1 |
| D-05 | Run comparison: two runs side by side — per-step outputs, prompts, tokens, cost, latency | P1 |
| D-06 | Prompt diff between versions | P1 |
| D-07 | Save runs/steps to a dataset (input + actual output, optionally marked as expected output) | P0 |
| D-08 | Datasets: create, import CSV/JSON, edit items | P0 |
| D-09 | Eval runs: run a workflow version (or a single node) against a dataset | P0 |
| D-10 | Scorers: exact match, contains, regex, JSON-schema valid, numeric threshold, LLM-as-judge with rubric | P0 |
| D-11 | Eval report: per-item scores, aggregate score, pass rate, cost, latency; compare two versions | P0 |
| D-12 | Publish gate: optional rule — block publish if eval score < threshold or drops > X% vs current published version | P1 |
| D-13 | Annotations: users mark a run's output as good/bad with a note (feeds datasets) | P2 |

### 6.6 Module 5 — Platform

| ID | Requirement | Priority |
|----|-------------|----------|
| PL-01 | Auth: email + password and GitHub/Google OAuth | P0 |
| PL-02 | Workspaces with roles: Owner, Editor, Viewer | P0 |
| PL-03 | Credentials vault: create/update/delete secrets; values encrypted; never returned to the client after save | P0 |
| PL-04 | Public REST API with workspace API keys (trigger runs, fetch run status/results) | P0 |
| PL-05 | Knowledge bases: upload PDF/TXT/MD, chunk, embed, store in pgvector | P1 |
| PL-06 | Audit log for sensitive actions (credential changes, publishes, member changes) | P1 |
| PL-07 | Usage page: runs, tokens, cost per period | P1 |
| PL-08 | Light/dark theme | P1 |

---

## 7. Key User Stories (with acceptance criteria)

**US-1 — Build and test a workflow** *(Persona A)*
As a developer, I want to drag nodes onto a canvas and test the workflow with sample input, so I can see it work before publishing.
- Given a valid graph, when I click "Test run" with JSON input, each node shows running → succeeded/failed live, with its output viewable inline.
- Invalid graphs show specific errors on the offending node before running.

**US-2 — Survive failures** *(Persona A)*
As a developer, I want runs to continue after a worker crash or a temporary API error, so I don't lose work or send duplicate actions.
- Killing a worker mid-run results in the run completing successfully on another worker.
- Completed steps are not executed again (verified by step attempt counts).
- A failing HTTP call with a 503 is retried per the node's policy; a 400 is not retried.

**US-3 — Debug a failed run in seconds** *(Persona A, B)*
As a developer, I want to open a failed run, see which step failed and why, fix it, and replay that step.
- The failed run page highlights the failed step and opens its error, input, and config.
- "Replay step" with an edited prompt returns a new output within the time of one node execution.
- Side-effect nodes are mocked in replay unless I enable them.

**US-4 — Compare prompt versions with evidence** *(Persona B)*
As an AI engineer, I want to run two workflow versions against the same dataset and compare scores, cost, and latency.
- The eval report shows per-item results and aggregates for both versions side by side.
- I can open any item to see both outputs and scorer reasoning.

**US-5 — Block bad releases** *(Persona B)*
As an AI engineer, I want publishing blocked if quality drops.
- With a publish gate enabled, publishing a version whose eval pass rate is below threshold fails with a clear message and a link to the eval report.

**US-6 — Know where money goes** *(Persona A, B)*
As a developer, I want to see cost per workflow, per node, and per model.
- Dashboard shows daily cost, with breakdowns and the top 5 most expensive nodes.

**US-7 — Get alerted** *(Persona C)*
As an operator, I want a Slack alert when a workflow's error rate exceeds 10% over 15 minutes.
- The alert fires once per breach (cooldown respected), links to the failing runs, and resolves when the rate recovers.

**US-8 — Trigger from my product** *(Persona A)*
As a developer, I want to trigger a workflow from my backend via webhook or REST API and get the result.
- Webhook returns a run ID immediately (async) or the result (sync mode with timeout).
- `GET /runs/:id` returns status and outputs.

---

## 8. Non-Functional Requirements

### 8.1 Performance targets (to be validated by benchmarks)

| Metric | Target |
|--------|--------|
| Engine scheduling overhead per step (excluding node work) | p95 < 50 ms |
| Concurrent active runs (single small deployment, 3 workers) | ≥ 1,000 |
| Steps executed per second (no-op nodes, 3 workers) | ≥ 500 |
| Live UI update latency (step status change → canvas) | p95 < 300 ms |
| Trace ingestion throughput | ≥ 10,000 spans/sec sustained |
| Trace query (single run trace load) | p95 < 300 ms |
| Dashboard aggregate queries over 30 days | p95 < 1 s |
| Trace visible in UI after step completes | p95 < 5 s |

### 8.2 Reliability

- **Zero lost completed steps** across worker crashes (chaos tested).
- **Zero duplicate executions** of a completed step (exactly-once *state transitions*; at-least-once delivery with idempotent handling).
- API availability target: 99.5% (single-region deployment).
- Observability failures must **never** fail or slow a workflow run (tracing is asynchronous and best-effort with buffering).

### 8.3 Security

- Credentials encrypted at rest with AES-256-GCM (envelope encryption); decrypted only inside workers at execution time.
- Code nodes run in a sandbox with memory/time limits and no network/filesystem access (JS); Python in an isolated container.
- HTTP node protected against SSRF (block private/link-local/metadata IP ranges).
- All APIs authenticated; role-based authorization on every workspace resource.
- Rate limiting on public endpoints (webhooks, API).
- PII redaction available before trace storage.
- Dependency and container image scanning in CI.

### 8.4 Scalability

- API, workers, and ingestion scale horizontally and independently.
- Stateless services; all state in PostgreSQL, Redis, ClickHouse, object storage.

### 8.5 Usability

- A new user builds and runs a template workflow in under 5 minutes.
- Every error message on a node states what failed and suggests a fix.
- Keyboard accessible core actions; WCAG AA contrast.

### 8.6 Maintainability

- TypeScript strict mode across the monorepo.
- Unit tests for engine scheduling logic ≥ 85% coverage; integration tests for each node; end-to-end tests for core journeys.
- Every node implemented via one shared node interface (schema + executor).

---

## 9. Success Metrics

### 9.1 Product metrics (if/when real users exist)

- Time to first successful run (target: < 5 min from signup).
- Median time from opening a failed run to a successful replay (target: < 60 s).
- % of published versions that went through an eval.
- Weekly active workflows.

### 9.2 Engineering proof metrics (published in repo)

- Load test results: concurrent runs, steps/sec, scheduling latency curves.
- Chaos test results: N workflows with random worker kills → lost steps = 0, duplicate step completions = 0, recovery time distribution.
- Ingestion benchmark: spans/sec and query latency at 10M / 50M spans.
- Eval case study: prompt v1 vs v2 on a dataset, with measured quality, cost, and latency changes.

---

## 10. Release Plan

| Phase | Weeks | Scope | Exit criteria |
|-------|-------|-------|---------------|
| **Phase 0 — Foundation** | Week 0–1 | Monorepo, CI, Docker Compose (Postgres, Redis, ClickHouse, MinIO), auth, workspaces, DB schema | `docker compose up` brings up the full stack; CI green |
| **Phase 1 — Build + Run** | Weeks 1–6 | Canvas, node library (P0 nodes), validation, versions, execution engine (DAG, parallel, retries, crash recovery, waits, cancel), live run view, credentials vault, webhook/cron/manual triggers, REST API | A 6+ node workflow with branches runs end-to-end; worker-kill test passes |
| **Phase 2 — Observe** | Weeks 7–11 | OpenTelemetry instrumentation, ingestion service, ClickHouse storage, trace viewer, runs explorer, dashboards, cost tracking, alerts, PII redaction | Every run has a full trace; dashboards load < 1 s; alert fires in test |
| **Phase 3 — Debug + Improve** | Weeks 12–14 | Step replay (safe mode), replay-from-here, run comparison, datasets, eval runs, scorers incl. LLM-as-judge, eval comparison, publish gate | Fail → replay → eval → gated publish works end-to-end |
| **Phase 4 — Proof & Polish** | Parallel / end | Load + chaos + ingestion benchmarks, README with results, architecture diagrams, demo video, technical blog post | Benchmarks reproducible via one command |

**P1/P2 items** are scheduled inside phases as time allows; P0 items gate each phase.

---

## 11. Competitive Landscape

| Product | Strength | Gap this platform addresses |
|---------|----------|-----------------------------|
| n8n / Zapier / Make | Huge integration libraries, mature builders | Shallow AI observability; no evals or replay-driven debugging |
| Langflow / Flowise / Dify | AI-first visual builders | Limited durable execution guarantees; observability mostly delegated to other tools |
| Langfuse / LangSmith / Helicone / Phoenix | Strong tracing and evals | Don't build or execute workflows; debugging can't directly replay inside the builder |
| Temporal / Inngest | Durable execution for code | Code-first; no visual builder or AI-specific observability |

**Differentiator:** the closed loop — *build → run → trace → replay → eval → gated publish* — inside one product, backed by a durable engine.

---

## 12. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Scope too large for timeline | High | High | Strict P0/P1/P2; each phase ships standalone value; cut P1 before slipping P0 |
| Execution engine correctness bugs (lost/duplicate steps) | Medium | High | State-machine design, DB transactions, idempotent jobs, property-based tests, chaos tests |
| LLM API costs during development/benchmarks | Medium | Medium | Mock LLM provider for load tests; local models via Ollama; budget caps |
| Sandbox escape in code nodes | Low | High | isolated-vm with strict limits; no host objects; container isolation for Python; deny network |
| ClickHouse operational complexity | Medium | Medium | Single-node ClickHouse in Docker for dev; simple schema; batch inserts |
| "Just a clone" perception | Medium | High | Lead with the integrated debug loop and published benchmarks |
| Tracing overhead slowing runs | Low | Medium | Async batch export, bounded buffers, drop-on-overload with counters |

---

## 13. Open Questions

1. Final product name and domain.
2. Execution engine in TypeScript only, or rewrite the scheduler core in Go after v1?
3. Self-host ClickHouse vs managed ClickHouse Cloud for the public demo?
4. Which LLM providers to support at launch (OpenAI, Anthropic, Gemini, Ollama — all four?).
5. Should replay of side-effect nodes ever be allowed in production workspaces, or only in test mode?
6. Public demo: open signup or invite-only to control LLM costs?

---

## 14. Appendix — Example Workflows (for templates and demos)

1. **Support ticket triage:** Webhook → Classifier (billing / bug / feature / other) → Switch → (bug) Extractor → HTTP create GitHub issue → Slack notify; (billing) LLM draft reply → Human Approval → Send Email.
2. **Lead enrichment:** Schedule → HTTP fetch new leads → Loop → HTTP enrich → LLM summarize company → Google Sheets append.
3. **Document Q&A bot:** Webhook (question) → Knowledge Retrieval → LLM answer with citations → Respond to Webhook.
4. **Daily report:** Schedule (9 AM) → Postgres query → Transform → LLM write summary → Slack message.
5. **Content moderation:** Webhook → LLM classify (safe / unsafe / review) → Condition → (review) Human Approval → HTTP callback.
