import { eq } from 'drizzle-orm';
import {
  cancelRemainingSteps,
  lockRun,
  stepRuns,
  transitionRun,
  transitionStep,
  type RunTransaction,
} from '@traceai/db';
import {
  nextPendingStatus,
  type CompiledGraph,
  type NodeResult,
  type StepJob,
} from '@traceai/engine';

export type StepCompletion = Extract<NodeResult, { status: 'success' | 'error' }>;
type StepState = Pick<typeof stepRuns.$inferSelect, 'nodeId' | 'iteration' | 'status' | 'branch'>;
const terminalStepStatuses = new Set(['succeeded', 'failed', 'skipped', 'cancelled']);

export async function advance(
  tx: RunTransaction,
  job: StepJob,
  graph: CompiledGraph | undefined,
  result: StepCompletion,
): Promise<StepJob[]> {
  const run = await lockRun(tx, job.runId);
  if (!run) return [];

  const completed =
    result.status === 'success'
      ? await transitionStep(tx, job, 'running', 'succeeded', {
          output: result.output,
          branch: result.branch ?? null,
        })
      : await transitionStep(tx, job, 'running', 'failed', {
          error: result.error,
          branch: null,
          output: graph?.continueOnError.has(job.nodeId) ? { error: result.error } : undefined,
        });
  if (!completed || run.status !== 'running') return [];

  const steps = await tx
    .select({
      nodeId: stepRuns.nodeId,
      iteration: stepRuns.iteration,
      status: stepRuns.status,
      branch: stepRuns.branch,
    })
    .from(stepRuns)
    .where(eq(stepRuns.runId, job.runId));
  if (
    steps.some(({ nodeId, status }) => status === 'failed' && !graph?.continueOnError.has(nodeId))
  ) {
    await transitionRun(tx, job.runId, 'running', 'failed');
    await cancelRemainingSteps(tx, job.runId);
    return [];
  }

  const ready = graph ? await scheduleChildren(tx, job, graph, steps) : [];
  if (steps.every(({ status }) => terminalStepStatuses.has(status))) {
    await transitionRun(tx, job.runId, 'running', 'succeeded');
  }
  return ready;
}

async function scheduleChildren(
  tx: RunTransaction,
  job: StepJob,
  graph: CompiledGraph,
  steps: StepState[],
) {
  const children = graph.children.get(job.nodeId);
  if (!children?.length) return [];
  const states = new Map(
    steps.filter(({ iteration }) => iteration === job.iteration).map((step) => [step.nodeId, step]),
  );

  const ready: StepJob[] = [];
  const candidates = new Set(children);
  for (const nodeId of graph.topologicalOrder) {
    const step = states.get(nodeId);
    if (!candidates.has(nodeId) || step?.status !== 'pending') continue;
    const status = nextPendingStatus(graph, nodeId, states);
    if (status === 'pending') continue;

    const next = { runId: job.runId, nodeId, iteration: job.iteration, attempt: 1 };
    if (!(await transitionStep(tx, next, 'pending', status))) continue;
    // Keep the run-wide snapshot in sync for the terminal-state check.
    step.status = status;
    if (status === 'queued') {
      ready.push(next);
    } else {
      for (const child of graph.children.get(nodeId) ?? []) candidates.add(child);
    }
  }
  return ready;
}
