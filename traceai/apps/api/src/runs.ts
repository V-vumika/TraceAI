import { db, stepRuns, workflowRuns } from "@traceai/db";
import { compileGraph, GraphCompilationError, nextPendingStatus, type StepJob } from "@traceai/engine";
import type { Graph } from "@traceai/nodes";

export async function persistRun(
  workflowId: string,
  versionId: string,
  graph: Graph,
  input: unknown,
): Promise<{ runId: string; readySteps: StepJob[] }> {
  const compiled = compileGraph(graph);
  const triggers = graph.nodes.filter((node) => node.data.nodeType === "manual-trigger");
  const [trigger] = triggers;
  if (!trigger || triggers.length !== 1) {
    throw new GraphCompilationError([
      {
        code: "no-trigger",
        message: "A manual run requires exactly one manual trigger.",
        nodeIds: triggers.map(({ id }) => id),
        edgeIds: [],
      },
    ]);
  }

  return db.transaction(async (tx) => {
    const [run] = await tx
      .insert(workflowRuns)
      .values({ workflowId, workflowVersionId: versionId, status: "queued", input })
      .returning({ id: workflowRuns.id });
    if (!run) throw new Error("Failed to create workflow run.");

    const now = new Date();
    const readySteps: StepJob[] = [];
    const completedSteps = new Map([[trigger.id, { status: "succeeded", branch: null }]]);
    await tx.insert(stepRuns).values(
      compiled.topologicalOrder.map((nodeId) => {
        const step = { runId: run.id, nodeId, iteration: 0 };
        if (nodeId === trigger.id) {
          return {
            ...step,
            status: "succeeded",
            input,
            output: input,
            startedAt: now,
            finishedAt: now,
          };
        }
        const status = nextPendingStatus(compiled, nodeId, completedSteps);
        if (status === "queued") readySteps.push({ ...step, attempt: 1 });
        return { ...step, status };
      }),
    );

    return { runId: run.id, readySteps };
  });
}
