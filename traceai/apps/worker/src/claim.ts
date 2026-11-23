import { db, transitionStep, type stepRuns } from '@traceai/db';
import type { StepJob } from '@traceai/engine';

export type ClaimedStep = typeof stepRuns.$inferSelect;

export async function claimStep(
  job: StepJob,
  connection: Pick<typeof db, 'update'> = db,
): Promise<ClaimedStep | undefined> {
  return transitionStep(connection, job, 'queued', 'running');
}
