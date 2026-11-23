import { randomUUID } from 'node:crypto';
import { Queue, QueueEvents } from 'bullmq';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { client, db, stepRuns, workflowRuns, workflows, workspaces } from '@traceai/db';
import {
  StepDispatcher,
  stepJobId,
  stepQueueName,
  stepRedisConnection,
  type StepJob,
} from '@traceai/engine';
import { createGraphRedis } from './graph-cache';
import { claimStep } from './claim';
import { createStepWorker, processStepJob } from './worker';

const redis = createGraphRedis(process.env);
const workspaceId = randomUUID();
const workflowId = randomUUID();
const runId = randomUUID();

async function seedStep(nodeId: string, status = 'queued', iteration = 0) {
  const [row] = await db
    .insert(stepRuns)
    .values({
      runId,
      nodeId,
      status,
      iteration,
      input: { ticket: 42 },
    })
    .returning();
  if (!row) throw new Error('Failed to create test step');
  return row;
}

function job(nodeId: string, iteration = 0): StepJob {
  return { runId, nodeId, iteration, attempt: 1 };
}

describe('worker claims in PostgreSQL', () => {
  beforeAll(async () => {
    await db.transaction(async (tx) => {
      await tx.insert(workspaces).values({ id: workspaceId, name: 'Claim test' });
      await tx
        .insert(workflows)
        .values({ id: workflowId, workspaceId, name: 'Claim test', definition: {} });
      await tx.insert(workflowRuns).values({ id: runId, workflowId, status: 'queued' });
    });
  }, 60000);

  afterAll(async () => {
    try {
      await db.transaction(async (tx) => {
        await tx.delete(stepRuns).where(eq(stepRuns.runId, runId));
        await tx.delete(workflowRuns).where(eq(workflowRuns.id, runId));
        await tx.delete(workflows).where(eq(workflows.id, workflowId));
        await tx.delete(workspaces).where(eq(workspaces.id, workspaceId));
      });
    } finally {
      redis.disconnect();
      await client.end();
    }
  }, 60000);

  it('returns the updated row only once for the matching run, node and iteration', async () => {
    const row = await seedStep('classify', 'queued', 1);
    expect(await claimStep({ ...job('classify', 1), runId: randomUUID() })).toBeUndefined();
    expect(await claimStep(job('classify', 0))).toBeUndefined();
    const claimed = await claimStep(job('classify', 1));
    expect(claimed).toMatchObject({ ...row, status: 'running', startedAt: expect.any(Date) });
    expect(await claimStep(job('classify', 1))).toBeUndefined();
    expect(await db.query.stepRuns.findFirst({ where: eq(stepRuns.id, row.id) })).toEqual(claimed);
  });

  it('skips missing steps', async () => {
    expect(await claimStep(job('missing-node'))).toBeUndefined();
  });

  it.each([
    'pending',
    'running',
    'retrying',
    'waiting',
    'succeeded',
    'failed',
    'skipped',
    'cancelled',
  ])('preserves a step already in %s', async (status) => {
    const row = await seedStep('existing-' + status, status);
    expect(await claimStep(job(row.nodeId))).toBeUndefined();
    expect(await db.query.stepRuns.findFirst({ where: eq(stepRuns.id, row.id) })).toEqual(row);
  });

  it('propagates a PostgreSQL error without entering the handler', async () => {
    const handler = vi.fn();
    // PostgreSQL rejects malformed UUID parameters before it can update a row.
    await expect(
      processStepJob({ ...job('bad-id'), runId: 'invalid-uuid' }, redis, handler),
    ).rejects.toMatchObject({ cause: expect.objectContaining({ code: '22P02' }) });
    expect(handler).not.toHaveBeenCalled();
  });

  it('lets exactly one concurrent claimant enter processing', async () => {
    const row = await seedStep('contended');
    const handler = vi.fn();
    await Promise.all(
      Array.from({ length: 8 }, () => processStepJob(job(row.nodeId), redis, handler)),
    );
    expect(handler).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: row.id, status: 'running' }),
      job(row.nodeId),
      undefined,
    );
  });

  it('consumes a task 51 job and acknowledges a duplicate delivery', async () => {
    const row = await seedStep('from-queue');
    const data = job(row.nodeId);
    const options = {
      prefix: 'claim-test-' + randomUUID(),
      connection: {
        ...stepRedisConnection(process.env),
        maxRetriesPerRequest: null,
        connectTimeout: 3000,
        retryStrategy: () => null,
      },
    };
    const queue = new Queue<StepJob>(stepQueueName, options);
    const events = new QueueEvents(stepQueueName, options);
    const handler = vi.fn();
    const worker = createStepWorker(options, redis, handler);
    const dispatcher = new StepDispatcher(options);
    try {
      await events.waitUntilReady();
      await dispatcher.enqueue([data]);
      const original = await queue.getJob(stepJobId(data));
      if (!original) throw new Error('Expected a dispatched step job');
      await original.waitUntilFinished(events, 20000);
      // Use a different delivery ID to exercise the DB guard past Redis deduplication.
      const duplicate = await queue.add('step', data, { jobId: 'duplicate-delivery' });
      await duplicate.waitUntilFinished(events, 20000);
      expect(handler).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ id: row.id, status: 'running' }),
        data,
        undefined,
      );
      expect(await queue.getCompletedCount()).toBe(2);
    } finally {
      await worker.close();
      await events.close();
      await dispatcher.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  }, 60000);
});
