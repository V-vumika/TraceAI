import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import {
  client,
  db,
  stepRuns,
  workflowRuns,
  workflows,
  workflowVersions,
  workspaces,
} from '@traceai/db';
import {
  compileGraph,
  StepDispatcher,
  stepJobId,
  stepQueueName,
  stepRedisConnection,
  type StepJob,
} from '@traceai/engine';
import { advance, type StepCompletion } from './advance';
import { createGraphRedis } from './graph-cache';
import { processStepJob } from './worker';

const workspaceId = randomUUID();
const workflowId = randomUUID();
const versionId = randomUUID();
const routingVersionId = randomUUID();
const runIds: string[] = [];
const redis = createGraphRedis(process.env);
const definition = {
  nodes: [
    { id: 'trigger', data: { nodeType: 'manual-trigger' } },
    ...['left', 'right', 'child'].map((id) => ({ id, data: { nodeType: 'delay' } })),
  ],
  edges: [
    { id: '1', source: 'trigger', target: 'left' },
    { id: '2', source: 'trigger', target: 'right' },
    { id: '3', source: 'left', target: 'child' },
    { id: '4', source: 'right', target: 'child' },
  ],
};
const graph = compileGraph(definition);
const success: StepCompletion = {
  status: 'success',
  output: { ok: true },
  logs: [],
  durationMs: 10,
};
const failure: StepCompletion = {
  status: 'error',
  error: { code: 'internal', message: 'step failed', retryable: false },
  logs: [],
  durationMs: 10,
};

function job(runId: string, nodeId: string): StepJob {
  return { runId, nodeId, iteration: 0, attempt: 1 };
}

async function seedRun(left: string, right: string, status = 'running') {
  const runId = randomUUID();
  await db.transaction(async (tx) => {
    await tx
      .insert(workflowRuns)
      .values({ id: runId, workflowId, workflowVersionId: versionId, status });
    await tx.insert(stepRuns).values([
      { runId, nodeId: 'left', status: left },
      { runId, nodeId: 'right', status: right },
      { runId, nodeId: 'child', status: 'pending' },
      { runId, nodeId: 'child', status: 'pending', iteration: 1 },
    ]);
  });
  runIds.push(runId);
  return runId;
}

async function readSteps(runId: string) {
  return db.select().from(stepRuns).where(eq(stepRuns.runId, runId));
}

beforeAll(async () => {
  await db.transaction(async (tx) => {
    await tx.insert(workspaces).values({ id: workspaceId, name: 'Advance test' });
    await tx
      .insert(workflows)
      .values({ id: workflowId, workspaceId, name: 'Advance test', definition });
    await tx.insert(workflowVersions).values({ id: versionId, workflowId, version: 1, definition });
  });
}, 60000);

afterAll(async () => {
  try {
    await db.transaction(async (tx) => {
      await tx.delete(stepRuns).where(inArray(stepRuns.runId, runIds));
      await tx.delete(workflowRuns).where(inArray(workflowRuns.id, runIds));
      await tx.delete(workflowVersions).where(eq(workflowVersions.workflowId, workflowId));
      await tx.delete(workflows).where(eq(workflows.id, workflowId));
      await tx.delete(workspaces).where(eq(workspaces.id, workspaceId));
    });
    await redis.del(`graph:${versionId}`, `graph:${routingVersionId}`).catch(() => undefined);
  } finally {
    redis.disconnect();
    await client.end();
  }
}, 60000);

it('waits for the run row lock before persisting a completion', async () => {
  const runId = await seedRun('running', 'succeeded');
  await db.transaction(async (owner) => {
    await owner.select().from(workflowRuns).where(eq(workflowRuns.id, runId)).for('update');
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '500ms'`);
        return advance(tx, job(runId, 'left'), graph, success);
      }),
    ).rejects.toMatchObject({ cause: { code: '55P03' } });
  });
  expect(await readSteps(runId)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ nodeId: 'left', status: 'running', finishedAt: null }),
      expect.objectContaining({ nodeId: 'child', status: 'pending', iteration: 0 }),
    ]),
  );
}, 30000);

it('rolls back both completion and scheduling when the transaction fails', async () => {
  const runId = await seedRun('running', 'succeeded');
  const failure = new Error('transaction interrupted');
  await expect(
    db.transaction(async (tx) => {
      expect(await advance(tx, job(runId, 'left'), graph, success)).toEqual([job(runId, 'child')]);
      throw failure;
    }),
  ).rejects.toBe(failure);
  expect(await readSteps(runId)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ nodeId: 'left', status: 'running', finishedAt: null }),
      expect.objectContaining({ nodeId: 'child', status: 'pending', iteration: 0 }),
    ]),
  );
}, 30000);

it('enqueues one child after both parents commit, even with concurrent and duplicate deliveries', async () => {
  const runId = await seedRun('queued', 'queued');
  const options = {
    connection: stepRedisConnection(process.env),
    prefix: `advance-test-${randomUUID()}`,
  };
  const dispatcher = new StepDispatcher(options);
  const queue = new Queue<StepJob>(stepQueueName, options);
  const enqueue = vi.fn(async (jobs: StepJob[]) => {
    expect(await readSteps(runId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: 'left', status: 'succeeded', output: success.output }),
        expect.objectContaining({ nodeId: 'right', status: 'succeeded', output: success.output }),
        expect.objectContaining({ nodeId: 'child', status: 'queued', iteration: 0 }),
        expect.objectContaining({ nodeId: 'child', status: 'pending', iteration: 1 }),
      ]),
    );
    await dispatcher.enqueue(jobs);
  });
  const finish = () => success;
  const left = job(runId, 'left');
  const right = job(runId, 'right');
  try {
    await Promise.all(
      [left, right, left].map((work) => processStepJob(work, redis, finish, { enqueue })),
    );
    expect(enqueue).toHaveBeenCalledExactlyOnceWith([job(runId, 'child')]);
    expect(await queue.getWaitingCount()).toBe(1);
    expect((await queue.getJob(stepJobId(job(runId, 'child'))))?.data).toEqual(job(runId, 'child'));
  } finally {
    await dispatcher.close();
    await queue.obliterate({ force: true });
    await queue.close();
  }
}, 60000);

it('fails the run and cancels outstanding steps while saving in-flight results', async () => {
  const cancelledId = await seedRun('running', 'succeeded', 'cancelled');
  const failedId = await seedRun('running', 'running');
  const outstanding = ['queued', 'waiting', 'retrying'];
  await db
    .insert(stepRuns)
    .values(outstanding.map((status) => ({ runId: failedId, nodeId: status, status })));
  const ready = await db.transaction(async (tx) => [
    ...(await advance(tx, job(cancelledId, 'left'), graph, success)),
    ...(await advance(tx, job(failedId, 'left'), graph, failure)),
  ]);
  expect(ready).toEqual([]);
  expect(
    await db.query.workflowRuns.findFirst({ where: eq(workflowRuns.id, cancelledId) }),
  ).toMatchObject({ status: 'cancelled' });
  const failedRun = await db.query.workflowRuns.findFirst({ where: eq(workflowRuns.id, failedId) });
  expect(failedRun).toMatchObject({ status: 'failed', finishedAt: expect.any(Date) });
  const pending = expect.objectContaining({ nodeId: 'child', status: 'pending', iteration: 0 });
  expect(await readSteps(cancelledId)).toEqual(
    expect.arrayContaining([
      pending,
      expect.objectContaining({ nodeId: 'left', status: 'succeeded' }),
    ]),
  );
  expect(await readSteps(failedId)).toEqual(
    expect.arrayContaining([
      ...['child', ...outstanding].map((nodeId) =>
        expect.objectContaining({
          nodeId,
          status: 'cancelled',
          finishedAt: expect.any(Date),
        }),
      ),
      expect.objectContaining({ nodeId: 'child', iteration: 1, status: 'cancelled' }),
      expect.objectContaining({ nodeId: 'right', status: 'running' }),
      expect.objectContaining({
        nodeId: 'left',
        status: 'failed',
        error: failure.error,
        finishedAt: expect.any(Date),
      }),
    ]),
  );
  expect(await db.transaction((tx) => advance(tx, job(failedId, 'right'), graph, success))).toEqual(
    [],
  );
  expect(await readSteps(failedId)).toContainEqual(
    expect.objectContaining({ nodeId: 'right', status: 'succeeded' }),
  );
  expect(await db.query.workflowRuns.findFirst({ where: eq(workflowRuns.id, failedId) })).toEqual(
    failedRun,
  );
}, 30000);

it('finishes only after the last iteration and ignores a duplicate completion', async () => {
  const runId = await seedRun('succeeded', 'succeeded');
  await db
    .update(stepRuns)
    .set({ status: 'running' })
    .where(and(eq(stepRuns.runId, runId), eq(stepRuns.nodeId, 'child')));
  const first = job(runId, 'child');
  const last = { ...first, iteration: 1 };

  expect(await db.transaction((tx) => advance(tx, first, graph, success))).toEqual([]);
  expect(
    await db.query.workflowRuns.findFirst({ where: eq(workflowRuns.id, runId) }),
  ).toMatchObject({
    status: 'running',
    finishedAt: null,
  });
  expect(await db.transaction((tx) => advance(tx, last, graph, success))).toEqual([]);
  const finished = await db.query.workflowRuns.findFirst({ where: eq(workflowRuns.id, runId) });
  expect(finished).toMatchObject({ status: 'succeeded', finishedAt: expect.any(Date) });

  expect(await db.transaction((tx) => advance(tx, last, graph, failure))).toEqual([]);
  expect(await db.query.workflowRuns.findFirst({ where: eq(workflowRuns.id, runId) })).toEqual(
    finished,
  );
}, 30000);

it('completes a run with skipped branches and a tolerated failure', async () => {
  const routing = {
    nodes: [
      { id: 'trigger', data: { nodeType: 'manual-trigger' } },
      { id: 'choose', data: { nodeType: 'condition', config: { expression: 'true' } } },
      { id: 'other', data: { nodeType: 'delay', settings: { continueOnError: true } } },
      ...['selected', 'rejected', 'tail', 'shared'].map((id) => ({
        id,
        data: { nodeType: 'delay' },
      })),
      { id: 'all', data: { nodeType: 'merge' } },
      ...['any', 'skip-any'].map((id) => ({
        id,
        data: { nodeType: 'merge', config: { mode: 'any' } },
      })),
    ],
    edges: [
      { id: '1', source: 'trigger', target: 'choose' },
      { id: '2', source: 'trigger', target: 'other' },
      { id: '3', source: 'choose', target: 'selected', sourceHandle: 'true' },
      { id: '4', source: 'choose', target: 'rejected', sourceHandle: 'false' },
      { id: '5', source: 'choose', target: 'shared', sourceHandle: 'false' },
      { id: '6', source: 'rejected', target: 'tail' },
      { id: '7', source: 'tail', target: 'skip-any' },
      { id: '8', source: 'tail', target: 'all' },
      { id: '9', source: 'selected', target: 'all' },
      { id: '10', source: 'selected', target: 'any' },
      { id: '11', source: 'other', target: 'any' },
      { id: '12', source: 'other', target: 'shared' },
    ],
  };
  const runId = randomUUID();
  await db.transaction(async (tx) => {
    await tx
      .insert(workflowVersions)
      .values({ id: routingVersionId, workflowId, version: 2, definition: routing });
    await tx
      .insert(workflowRuns)
      .values({ id: runId, workflowId, workflowVersionId: routingVersionId, status: 'queued' });
    await tx.insert(stepRuns).values(
      routing.nodes.map(({ id: nodeId }) => ({
        runId,
        nodeId,
        status:
          nodeId === 'trigger'
            ? 'succeeded'
            : ['choose', 'other'].includes(nodeId)
              ? 'queued'
              : 'pending',
      })),
    );
  });
  runIds.push(runId);
  const dispatch = { enqueue: vi.fn().mockResolvedValue(undefined) };
  await processStepJob(
    job(runId, 'choose'),
    redis,
    () => ({ ...success, branch: 'true' }),
    dispatch,
  );
  const first = await readSteps(runId);
  expect(first).toContainEqual(
    expect.objectContaining({ nodeId: 'choose', branch: 'true', output: success.output }),
  );
  expect(
    first
      .filter(({ status }) => status === 'skipped')
      .map(({ nodeId }) => nodeId)
      .sort(),
  ).toEqual(['rejected', 'skip-any', 'tail']);
  expect(first.find(({ nodeId }) => nodeId === 'shared')?.status).toBe('pending');
  expect(dispatch.enqueue).toHaveBeenCalledExactlyOnceWith([job(runId, 'selected')]);

  await processStepJob(job(runId, 'other'), redis, () => failure, dispatch);
  expect(dispatch.enqueue).toHaveBeenNthCalledWith(
    2,
    expect.arrayContaining([job(runId, 'any'), job(runId, 'shared')]),
  );
  expect(await readSteps(runId)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ nodeId: 'all', status: 'pending' }),
      expect.objectContaining({
        nodeId: 'other',
        status: 'failed',
        error: failure.error,
        output: { error: failure.error },
      }),
    ]),
  );

  await processStepJob(job(runId, 'selected'), redis, () => success, dispatch);
  expect(dispatch.enqueue).toHaveBeenCalledTimes(3);
  expect(dispatch.enqueue).toHaveBeenNthCalledWith(3, [job(runId, 'all')]);

  await Promise.all(
    ['any', 'all', 'shared'].map((nodeId) =>
      processStepJob(job(runId, nodeId), redis, () => success, dispatch),
    ),
  );
  expect(
    await db.query.workflowRuns.findFirst({ where: eq(workflowRuns.id, runId) }),
  ).toMatchObject({
    status: 'succeeded',
    finishedAt: expect.any(Date),
  });
  expect(dispatch.enqueue).toHaveBeenCalledTimes(3);
}, 60000);
