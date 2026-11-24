import { Worker, type WorkerOptions } from 'bullmq';
import { db, transitionRun } from '@traceai/db';
import type { Redis } from 'ioredis';
import { loadRunGraph } from './run-graph';
import {
  stepQueueName,
  type CompiledGraph,
  type StepDispatcher,
  type StepJob,
} from '@traceai/engine';
import { claimStep, type ClaimedStep } from './claim';
import { advance, type StepCompletion } from './advance';

type ClaimedHandler = (
  step: ClaimedStep,
  job: StepJob,
  graph: CompiledGraph | undefined,
) => void | StepCompletion | Promise<void | StepCompletion>;

type Dispatcher = Pick<StepDispatcher, 'enqueue'>;

export async function processStepJob(
  job: StepJob,
  redis: Redis,
  onClaimed: ClaimedHandler,
  dispatcher: Dispatcher,
): Promise<void> {
  const claimed = await db.transaction(async (tx) => {
    const step = await claimStep(job, tx);
    if (!step) return;
    // A failed source load rolls the claim back. Duplicate jobs never touch the cache.
    const graph = await loadRunGraph(redis, step.runId, tx);
    await transitionRun(tx, step.runId, 'queued', 'running');
    return { step, graph };
  });
  if (!claimed) return;
  const result = await onClaimed(claimed.step, job, claimed.graph);
  if (!result) return;

  const ready = await db.transaction((tx) => advance(tx, job, claimed.graph, result), {
    isolationLevel: 'read committed',
  });
  if (ready.length) await dispatcher.enqueue(ready);
}

export function createStepWorker(
  options: WorkerOptions,
  redis: Redis,
  onClaimed: ClaimedHandler,
  dispatcher: Dispatcher,
) {
  return new Worker<StepJob, void>(
    stepQueueName,
    (job) => processStepJob(job.data, redis, onClaimed, dispatcher),
    options,
  );
}
