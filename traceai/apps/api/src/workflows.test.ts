import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db, stepRuns, workflowRuns, workflowVersions } from "@traceai/db";
import { app } from "./server";
import { persistRun } from "./runs";
import { StepDispatcher } from "@traceai/engine";

afterEach(() => { vi.restoreAllMocks(); });

const password = "TestPass123!";
const runId = Date.now();

type AuthHeaders = { authorization: string };

async function registerUser(label: string): Promise<AuthHeaders> {
  const email = `wf-${label}-${runId}@example.com`;

  const signup = await app.inject({
    method: "POST",
    url: "/auth/signup",
    payload: { name: `Workflow ${label}`, email, password },
  });
  expect(signup.statusCode).toBe(201);

  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
  expect(login.statusCode).toBe(200);

  return { authorization: `Bearer ${login.json().accessToken}` };
}

const triggerNode = {
  id: "a",
  type: "workflow",
  position: { x: 0, y: 0 },
  data: { nodeType: "manual-trigger", label: "Manual Trigger" },
};

const llmNode = {
  id: "b",
  type: "workflow",
  position: { x: 288, y: 0 },
  data: {
    nodeType: "llm",
    label: "LLM",
    config: {
      provider: "mock",
      model: "mock-1",
      prompt: "Hello {{ input }}",
      temperature: 0.7,
      maxTokens: 512,
    },
    settings: { timeoutSeconds: 60, maxRetries: 0, continueOnError: false },
  },
};

const fullGraph = {
  nodes: [triggerNode, llmNode],
  edges: [
    { id: "e1", source: "a", target: "b", sourceHandle: null, targetHandle: null },
  ],
};

const smallGraph = { nodes: [triggerNode], edges: [] };

let owner: AuthHeaders;
let stranger: AuthHeaders;
let workspaceId = "";
let workflowId = "";

async function readDraft() {
  const response = await app.inject({
    method: "GET",
    url: `/workflows/${workflowId}`,
    headers: owner,
  });
  expect(response.statusCode).toBe(200);
  return response.json().workflow.draftGraph;
}

describe("Workflow routes", () => {
  beforeAll(async () => {
    await app.ready();
    owner = await registerUser("owner");
    stranger = await registerUser("stranger");

    const workspace = await app.inject({
      method: "POST",
      url: "/workspaces",
      headers: owner,
      payload: { name: "Workflow tests" },
    });
    expect(workspace.statusCode).toBe(201);
    workspaceId = workspace.json().workspace.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates a workflow with an empty draft", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/workspaces/${workspaceId}/workflows`,
      headers: owner,
      payload: { name: "Autosave test" },
    });

    expect(response.statusCode).toBe(201);

    // Set the id first, so the next tests still work if a later check fails.
    workflowId = response.json().workflow.id;
    expect(workflowId).toBeTruthy();

    // Read it back from the database instead of trusting the create response.
    expect(await readDraft()).toEqual({ nodes: [], edges: [] });
  });

  it("lists the workspaces of the user", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/workspaces",
      headers: owner,
    });

    expect(response.statusCode).toBe(200);
    const found = response
      .json()
      .workspaces.find((item: { id: string }) => item.id === workspaceId);
    expect(found?.role).toBe("owner");
  });

  it("lists the workflows of a workspace", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/workspaces/${workspaceId}/workflows`,
      headers: owner,
    });

    expect(response.statusCode).toBe(200);
    const ids = response
      .json()
      .workflows.map((item: { id: string }) => item.id);
    expect(ids).toContain(workflowId);
  });

  it("saves a draft and reads back the same graph", async () => {
    const save = await app.inject({
      method: "PATCH",
      url: `/workflows/${workflowId}/draft`,
      headers: owner,
      payload: { graph: fullGraph },
    });

    expect(save.statusCode).toBe(200);
    expect(save.json().id).toBe(workflowId);
    expect(await readDraft()).toEqual(fullGraph);
  });

  it("overwrites the draft on the next save", async () => {
    const save = await app.inject({
      method: "PATCH",
      url: `/workflows/${workflowId}/draft`,
      headers: owner,
      payload: { graph: smallGraph },
    });

    expect(save.statusCode).toBe(200);
    expect(await readDraft()).toEqual(smallGraph);
  });

  it("rejects an invalid graph and keeps the saved one", async () => {
    const save = await app.inject({
      method: "PATCH",
      url: `/workflows/${workflowId}/draft`,
      headers: owner,
      payload: { graph: { nodes: "oops", edges: [] } },
    });

    expect(save.statusCode).toBe(400);
    expect(await readDraft()).toEqual(smallGraph);
  });

  it("rejects a graph with too many nodes", async () => {
    const nodes = Array.from({ length: 501 }, (_, index) => ({
      id: `n${index}`,
      position: { x: 0, y: 0 },
      data: {},
    }));

    const save = await app.inject({
      method: "PATCH",
      url: `/workflows/${workflowId}/draft`,
      headers: owner,
      payload: { graph: { nodes, edges: [] } },
    });

    expect(save.statusCode).toBe(400);
  });

  it("hides a workflow from users outside the workspace", async () => {
    const read = await app.inject({
      method: "GET",
      url: `/workflows/${workflowId}`,
      headers: stranger,
    });
    expect(read.statusCode).toBe(404);

    const save = await app.inject({
      method: "PATCH",
      url: `/workflows/${workflowId}/draft`,
      headers: stranger,
      payload: { graph: fullGraph },
    });
    expect(save.statusCode).toBe(404);

    const list = await app.inject({
      method: "GET",
      url: `/workspaces/${workspaceId}/workflows`,
      headers: stranger,
    });
    expect(list.statusCode).toBe(403);

    const create = await app.inject({
      method: "POST",
      url: `/workspaces/${workspaceId}/workflows`,
      headers: stranger,
      payload: { name: "Sneaky workflow" },
    });
    expect(create.statusCode).toBe(403);

    expect(await readDraft()).toEqual(smallGraph);
  });

  it("requires login", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/workflows/${workflowId}`,
    });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an invalid workflow id", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/workflows/not-a-uuid",
      headers: owner,
    });

    expect(response.statusCode).toBe(400);
  });

  async function storeVersion(version: number, definition: unknown) {
    const [stored] = await db
      .insert(workflowVersions)
      .values({ workflowId, version, definition })
      .returning({ id: workflowVersions.id });
    if (!stored) throw new Error("Failed to insert test workflow version.");
    return stored.id;
  }

  async function startRun(versionId: string, input: unknown, headers = owner) {
    return app.inject({
      method: "POST",
      url: "/api/v1/workflows/" + workflowId + "/runs",
      headers,
      payload: { versionId, input },
    });
  }

  it("creates a run and initializes every step from the requested version", async () => {
    const versionId = await storeVersion(1, {
      nodes: [
        ...fullGraph.nodes,
        { ...llmNode, id: "c" },
        { ...llmNode, id: "d" },
        { ...llmNode, id: "e" },
      ],
      edges: [
        ...fullGraph.edges,
        { id: "e2", source: "b", target: "c" },
        { id: "e3", source: "a", target: "d" },
        { id: "e4", source: "a", target: "e" },
        { id: "e5", source: "d", target: "e" },
      ],
    });
    const input = { ticket: "sample", urgent: false };
    let committedNodeIds: string[] = [];
    const enqueue = vi.spyOn(StepDispatcher.prototype, "enqueue").mockImplementationOnce(async (jobs) => {
      const [first] = jobs;
      if (!first) throw new Error("Expected ready steps.");
      // An independent PostgreSQL connection can only see committed rows.
      const rows = await db.select().from(stepRuns).where(eq(stepRuns.runId, first.runId));
      committedNodeIds = rows.map((row) => row.nodeId).sort();
    });
    const response = await startRun(versionId, input);

    expect(response.statusCode).toBe(202);
    const { runId: createdId } = response.json<{ runId: string }>();
    expect(committedNodeIds).toEqual(["a", "b", "c", "d", "e"]);
    expect(enqueue).toHaveBeenCalledExactlyOnceWith([
      { runId: createdId, nodeId: "b", iteration: 0, attempt: 1 },
      { runId: createdId, nodeId: "d", iteration: 0, attempt: 1 },
    ]);
    const run = await db.query.workflowRuns.findFirst({
      where: eq(workflowRuns.id, createdId),
    });
    expect(run).toMatchObject({
      workflowId,
      workflowVersionId: versionId,
      status: "queued",
      input,
    });

    const steps = await db
      .select()
      .from(stepRuns)
      .where(eq(stepRuns.runId, createdId))
      .orderBy(stepRuns.nodeId);
    expect(steps).toMatchObject([
      { nodeId: "a", status: "succeeded", iteration: 0, input, output: input, finishedAt: expect.any(Date) },
      { nodeId: "b", status: "queued", iteration: 0 },
      { nodeId: "c", status: "pending", iteration: 0 },
      { nodeId: "d", status: "queued", iteration: 0 },
      { nodeId: "e", status: "pending", iteration: 0 },
    ]);
  });

  it("rejects a run when the version is missing or the user lacks access", async () => {
    const versionId = await storeVersion(2, fullGraph);
    expect((await startRun(versionId, {}, stranger)).statusCode).toBe(404);
    expect((await startRun("00000000-0000-4000-8000-000000000000", {})).statusCode).toBe(404);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/workflows/" + workflowId + "/runs",
      headers: owner,
      payload: { input: {} },
    });
    expect(response.statusCode).toBe(400);
  });

  it("queues an any-mode merge directly from the trigger while its other parent waits", async () => {
    const versionId = await storeVersion(6, {
      nodes: [
        ...fullGraph.nodes,
        { ...llmNode, id: "join", data: { nodeType: "merge", config: { mode: "any" } } },
      ],
      edges: [
        ...fullGraph.edges,
        { id: "trigger-join", source: "a", target: "join" },
        { id: "llm-join", source: "b", target: "join" },
      ],
    });
    const enqueue = vi.spyOn(StepDispatcher.prototype, "enqueue").mockResolvedValueOnce(undefined);
    const response = await startRun(versionId, {});
    expect(response.statusCode).toBe(202);
    const { runId } = response.json<{ runId: string }>();
    expect(enqueue).toHaveBeenCalledExactlyOnceWith([
      { runId, nodeId: "b", iteration: 0, attempt: 1 },
      { runId, nodeId: "join", iteration: 0, attempt: 1 },
    ]);
    expect((await db.query.stepRuns.findMany({ where: eq(stepRuns.runId, runId) }))
      .find(({ nodeId }) => nodeId === "join")?.status).toBe("queued");
  });

  it("rejects invalid graphs before creating a run", async () => {
    const enqueue = vi.spyOn(StepDispatcher.prototype, "enqueue");
    const versionId = await storeVersion(3, { nodes: [], edges: [] });
    const response = await startRun(versionId, {});

    expect(response.statusCode).toBe(422);
    expect(enqueue).not.toHaveBeenCalled();
    expect(await db.query.workflowRuns.findFirst({
      where: eq(workflowRuns.workflowVersionId, versionId),
    })).toBeUndefined();
  });

  it("returns the committed run ID and preserves ready steps when Redis rejects delivery", async () => {
    const versionId = await storeVersion(5, fullGraph);
    vi.spyOn(StepDispatcher.prototype, "enqueue").mockRejectedValueOnce(new Error("Redis unavailable"));
    const response = await startRun(versionId, {});
    expect(response.statusCode).toBe(202);
    const { runId } = response.json<{ runId: string }>();
    const steps = await db.select().from(stepRuns).where(eq(stepRuns.runId, runId)).orderBy(stepRuns.nodeId);
    expect(steps.map(({ nodeId, status }) => [nodeId, status])).toEqual([["a", "succeeded"], ["b", "queued"]]);
  });

  it("rolls back the run when PostgreSQL rejects a step insert", async () => {
    const versionId = await storeVersion(4, fullGraph);
    // PostgreSQL text fields reject NUL, forcing the second insert to fail.
    const invalidId = "bad\u0000id";
    const graph = {
      nodes: [triggerNode, { ...llmNode, id: invalidId }],
      edges: [{ id: "e1", source: triggerNode.id, target: invalidId }],
    };

    await expect(persistRun(workflowId, versionId, graph, {})).rejects.toMatchObject({
      cause: expect.objectContaining({ code: "22021" }),
    });
    expect(await db.query.workflowRuns.findFirst({
      where: eq(workflowRuns.workflowVersionId, versionId),
    })).toBeUndefined();
  });
});
