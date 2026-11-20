import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "./server";

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
});