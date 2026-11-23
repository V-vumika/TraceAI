import { Worker, type WorkerOptions } from 'bullmq';
import { db } from '@traceai/db';
import type { Redis } from 'ioredis';
import { loadRunGraph } from './run-graph';
import { stepQueueName, type CompiledGraph, type StepJob } from '@traceai/engine';
import { claimStep, type ClaimedStep } from './claim';

type ClaimedHandler = (
  step: ClaimedStep,
  job: StepJob,
  graph: CompiledGraph | undefined,
) => void | Promise<void>;

export async function processStepJob(
  job: StepJob,
  redis: Redis,
  onClaimed: ClaimedHandler,
): Promise<void> {
  const claimed = await db.transaction(async (tx) => {
    const step = await claimStep(job, tx);
    if (!step) return;
    // A failed source load rolls the claim back. Duplicate jobs never touch the cache.
    const graph = await loadRunGraph(redis, step.runId, tx);
    return { step, graph };
  });
  if (claimed) await onClaimed(claimed.step, job, claimed.graph);
}

export function createStepWorker(options: WorkerOptions, redis: Redis, onClaimed: ClaimedHandler) {
  return new Worker<StepJob, void>(
    stepQueueName,
    (job) => processStepJob(job.data, redis, onClaimed),
    options,
  );
}
