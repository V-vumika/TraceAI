import { and, eq, sql } from 'drizzle-orm';
import { db, stepRuns } from '@traceai/db';
import type { StepJob } from '@traceai/engine';

export type ClaimedStep = typeof stepRuns.$inferSelect;

export async function claimStep(
  job: StepJob,
  connection: Pick<typeof db, 'update'> = db,
): Promise<ClaimedStep | undefined> {
  const [claimed] = await connection
    .update(stepRuns)
    .set({ status: 'running', startedAt: sql`now()` })
    .where(
      and(
        eq(stepRuns.runId, job.runId),
        eq(stepRuns.nodeId, job.nodeId),
        eq(stepRuns.iteration, job.iteration),
        eq(stepRuns.status, 'queued'),
      ),
    )
    .returning();

  return claimed;
}
