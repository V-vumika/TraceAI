import { and, eq, inArray, sql } from 'drizzle-orm';
import type { db } from './client';
import { stepRuns, workflowRuns } from './schema';

const runTransitions = {
  queued: ['running', 'cancelled'],
  running: ['waiting', 'succeeded', 'failed', 'cancelled', 'timed_out'],
  waiting: ['running', 'cancelled', 'timed_out'],
  succeeded: [],
  failed: [],
  cancelled: [],
  timed_out: [],
} as const;

const stepTransitions = {
  pending: ['queued', 'skipped', 'cancelled'],
  queued: ['running', 'cancelled'],
  running: ['succeeded', 'failed', 'retrying', 'waiting', 'cancelled'],
  retrying: ['queued', 'cancelled'],
  waiting: ['succeeded', 'failed', 'cancelled'],
  succeeded: [],
  failed: [],
  skipped: [],
  cancelled: [],
} as const;

type RunStatus = keyof typeof runTransitions;
type StepStatus = keyof typeof stepTransitions;
type UpdateConnection = Pick<typeof db, 'update'>;
type StepKey = Pick<typeof stepRuns.$inferSelect, 'runId' | 'nodeId' | 'iteration'>;
export type RunTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockRun(tx: RunTransaction, runId: string) {
  const [run] = await tx
    .select({ status: workflowRuns.status })
    .from(workflowRuns)
    .where(eq(workflowRuns.id, runId))
    .for('update');
  return run;
}

export async function cancelRemainingSteps(tx: RunTransaction, runId: string) {
  await tx
    .update(stepRuns)
    .set({ status: 'cancelled', finishedAt: sql`now()` })
    .where(
      and(
        eq(stepRuns.runId, runId),
        inArray(stepRuns.status, ['pending', 'queued', 'retrying', 'waiting']),
      ),
    );
}

function checkTransition(allowed: readonly string[] | undefined, from: string, to: string) {
  if (!allowed?.includes(to)) throw new Error(`Invalid state transition: ${from} -> ${to}`);
}

export async function transitionRun(
  connection: UpdateConnection,
  runId: string,
  from: RunStatus,
  to: RunStatus,
  { output }: { output?: unknown } = {},
) {
  checkTransition(runTransitions[from], from, to);
  const [row] = await connection
    .update(workflowRuns)
    .set({
      status: to,
      output,
      startedAt: from === 'queued' && to === 'running' ? sql`now()` : undefined,
      finishedAt: runTransitions[to].length === 0 ? sql`now()` : undefined,
    })
    .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.status, from)))
    .returning();
  return row;
}

export async function transitionStep(
  connection: UpdateConnection,
  key: StepKey,
  from: StepStatus,
  to: StepStatus,
  {
    input,
    output,
    error,
    branch,
  }: { input?: unknown; output?: unknown; error?: unknown; branch?: string | null } = {},
) {
  checkTransition(stepTransitions[from], from, to);
  const [row] = await connection
    .update(stepRuns)
    .set({
      status: to,
      input,
      output,
      error,
      branch,
      startedAt: to === 'running' ? sql`now()` : undefined,
      finishedAt: stepTransitions[to].length === 0 ? sql`now()` : undefined,
    })
    .where(
      and(
        eq(stepRuns.runId, key.runId),
        eq(stepRuns.nodeId, key.nodeId),
        eq(stepRuns.iteration, key.iteration),
        eq(stepRuns.status, from),
      ),
    )
    .returning();
  return row;
}
