import { and, eq } from 'drizzle-orm';
import { type db, stepRuns, transitionStep, workflowRuns } from '@traceai/db';
import type { CompiledGraph, NodeResult, StepJob } from '@traceai/engine';

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
      ? await transitionStep(tx, job, 'running', 'succeeded', { output: result.output })
      : await transitionStep(tx, job, 'running', 'failed', { error: result.error });
  if (!completed || result.status === 'error' || run.status !== 'running' || !graph) return [];

  const children = graph.children.get(job.nodeId);
  if (!children?.length) return [];

  const steps = await tx
    .select({ nodeId: stepRuns.nodeId, status: stepRuns.status })
    .from(stepRuns)
    .where(and(eq(stepRuns.runId, job.runId), eq(stepRuns.iteration, job.iteration)));
  const statuses = new Map(steps.map(({ nodeId, status }) => [nodeId, status]));

  const ready: StepJob[] = [];
  for (const nodeId of children) {
    if (statuses.get(nodeId) !== 'pending') continue;
    const parents = graph.parents.get(nodeId);
    if (!parents?.length || !parents.every((parent) => statuses.get(parent) === 'succeeded'))
      continue;

    const next = { runId: job.runId, nodeId, iteration: job.iteration, attempt: 1 };
    if (await transitionStep(tx, next, 'pending', 'queued')) ready.push(next);
  }
  return ready;
}
