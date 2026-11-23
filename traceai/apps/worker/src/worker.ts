import { Worker, type WorkerOptions } from 'bullmq';
import { stepQueueName, type StepJob } from '@traceai/engine';
import { claimStep, type ClaimedStep } from './claim';

type ClaimedHandler = (step: ClaimedStep, job: StepJob) => void | Promise<void>;

export async function processStepJob(job: StepJob, onClaimed: ClaimedHandler): Promise<void> {
  const step = await claimStep(job);
  if (step) await onClaimed(step, job);
}

export function createStepWorker(options: WorkerOptions, onClaimed: ClaimedHandler) {
  return new Worker<StepJob, void>(
    stepQueueName,
    (job) => processStepJob(job.data, onClaimed),
    options,
  );
}
