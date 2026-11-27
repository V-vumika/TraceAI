import { and, eq } from 'drizzle-orm';
import { type db, stepRuns, transitionStep, workflowRuns } from '@traceai/db';
import {
  nextPendingStatus,
  type CompiledGraph,
  type NodeResult,
  type StepJob,
} from '@traceai/engine';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type StepCompletion = Extract<NodeResult, { status: 'success' | 'error' }>;

export async function advance(
  tx: Transaction,
  job: StepJob,
  graph: CompiledGraph | undefined,
  result: StepCompletion,
): Promise<StepJob[]> {
  const [run] = await tx
    .select({ status: workflowRuns.status })
    .from(workflowRuns)
    .where(eq(workflowRuns.id, job.runId))
    .for('update');
  if (!run) return [];

  const completed =
    result.status === 'success'
      ? await transitionStep(tx, job, 'running', 'succeeded', {
          output: result.output,
          branch: result.branch ?? null,
        })
      : await transitionStep(tx, job, 'running', 'failed', { error: result.error });
  if (!completed || result.status === 'error' || run.status !== 'running' || !graph) return [];

  const children = graph.children.get(job.nodeId);
  if (!children?.length) return [];

  const steps = await tx
    .select({ nodeId: stepRuns.nodeId, status: stepRuns.status, branch: stepRuns.branch })
    .from(stepRuns)
    .where(and(eq(stepRuns.runId, job.runId), eq(stepRuns.iteration, job.iteration)));
  const states = new Map(steps.map(({ nodeId, status, branch }) => [nodeId, { status, branch }]));

  const ready: StepJob[] = [];
  const candidates = new Set(children);
  for (const nodeId of graph.topologicalOrder) {
    if (!candidates.has(nodeId) || states.get(nodeId)?.status !== 'pending') continue;
    const status = nextPendingStatus(graph, nodeId, states);
    if (status === 'pending') continue;

    const next = { runId: job.runId, nodeId, iteration: job.iteration, attempt: 1 };
    if (!(await transitionStep(tx, next, 'pending', status))) continue;
    states.set(nodeId, { status, branch: null });
    if (status === 'queued') {
      ready.push(next);
    } else {
      for (const child of graph.children.get(nodeId) ?? []) candidates.add(child);
    }
  }
  return ready;
}
