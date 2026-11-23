import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { eq } from 'drizzle-orm';
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
import { compileGraph } from '@traceai/engine';
import { cachedGraph, createGraphRedis } from './graph-cache';
import { loadVersionGraph } from './run-graph';
import { processStepJob } from './worker';

const workspaceId = randomUUID();
const workflowId = randomUUID();
const runId = randomUUID();
const versionId = randomUUID();
const key = 'graph:' + versionId;
const redis = createGraphRedis(process.env);
const load = () => loadVersionGraph(redis, workflowId, versionId);

function definition(target: string) {
  return {
    nodes: [
      { id: 'trigger', data: { nodeType: 'manual-trigger' } },
      { id: target, data: { nodeType: 'delay' } },
    ],
    edges: [{ id: 'edge', source: 'trigger', target }],
  };
}

beforeAll(async () => {
  if (redis.status !== 'ready') await once(redis, 'ready');
  await db.transaction(async (tx) => {
    await tx.insert(workspaces).values({ id: workspaceId, name: 'Graph cache test' });
    await tx
      .insert(workflows)
      .values({ id: workflowId, workspaceId, name: 'Graph', definition: {} });
    await tx
      .insert(workflowVersions)
      .values({ id: versionId, workflowId, version: 1, definition: definition('wait') });
    await tx
      .insert(workflowRuns)
      .values({ id: runId, workflowId, workflowVersionId: versionId, status: 'queued' });
    await tx.insert(stepRuns).values({ runId, nodeId: 'wait', status: 'queued' });
  });
}, 60000);

afterAll(async () => {
  try {
    await db.transaction(async (tx) => {
      await tx.delete(stepRuns).where(eq(stepRuns.runId, runId));
      await tx.delete(workflowRuns).where(eq(workflowRuns.id, runId));
      await tx.delete(workflowVersions).where(eq(workflowVersions.workflowId, workflowId));
      await tx.delete(workflows).where(eq(workflows.id, workflowId));
      await tx.delete(workspaces).where(eq(workspaces.id, workspaceId));
    });
    await redis.del(key);
  } finally {
    redis.disconnect();
    await client.end();
  }
}, 60000);

it('loads the pinned graph on a worker miss and serves the compiled maps on a hit', async () => {
  await redis.del(key);
  const handler = vi.fn();
  const job = { runId, nodeId: 'wait', iteration: 0, attempt: 1 };
  await processStepJob(job, redis, handler);
  const expected = compileGraph(definition('wait'));
  expect(handler).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ status: 'running' }),
    job,
    expected,
  );
  const ttl = await redis.ttl(key);
  expect(ttl).toBeGreaterThan(0);
  expect(ttl).toBeLessThanOrEqual(3600);
  const revision = await redis.hget(key, 'revision');
  expect(revision).toBeTruthy();
  const source = vi.fn();
  expect(await cachedGraph(redis, versionId, revision!, source)).toEqual(expected);
  expect(source).not.toHaveBeenCalled();
}, 60000);

it('rolls the claim back when the published graph cannot compile', async () => {
  await db.insert(stepRuns).values({ runId, nodeId: 'retry', status: 'queued' });
  const handler = vi.fn();
  try {
    await db
      .update(workflowVersions)
      .set({ definition: { nodes: [], edges: [] } })
      .where(eq(workflowVersions.id, versionId));
    await expect(
      processStepJob({ runId, nodeId: 'retry', iteration: 0, attempt: 1 }, redis, handler),
    ).rejects.toThrow('trigger');
    expect(handler).not.toHaveBeenCalled();
    const steps = await db.select().from(stepRuns).where(eq(stepRuns.runId, runId));
    expect(steps.find((step) => step.nodeId === 'retry')).toMatchObject({
      status: 'queued',
      startedAt: null,
    });
  } finally {
    await db
      .update(workflowVersions)
      .set({ definition: definition('wait') })
      .where(eq(workflowVersions.id, versionId));
  }
}, 60000);

it('recovers from an unreadable or expired cache entry', async () => {
  const expected = await load();
  await redis.hset(key, 'compiled-v1', 'not valid JSON');
  expect(await load()).toEqual(expected);
  expect(await redis.hget(key, 'compiled-v1')).not.toBe('not valid JSON');
  await redis.expire(key, 0);
  expect(await load()).toEqual(expected);
  expect(await redis.ttl(key)).toBeGreaterThan(0);
}, 60000);

it('falls back to PostgreSQL with a disconnected cache client', async () => {
  const offline = createGraphRedis(process.env);
  offline.disconnect();
  expect(await loadVersionGraph(offline, workflowId, versionId)).toEqual(
    compileGraph(definition('wait')),
  );
}, 60000);

it('isolates draft edits and invalidates a changed or deleted published version', async () => {
  // Use a separate version so this case is independent of the worker fixture.
  const id = randomUUID();
  const versionKey = 'graph:' + id;
  const read = () => loadVersionGraph(redis, workflowId, id);
  try {
    await db
      .insert(workflowVersions)
      .values({ id, workflowId, version: 2, definition: definition('first') });
    const first = await read();
    const originalRevision = await redis.hget(versionKey, 'revision');
    await db
      .update(workflows)
      .set({ draftGraph: definition('draft-only') })
      .where(eq(workflows.id, workflowId));
    expect(await read()).toEqual(first);
    await db
      .update(workflowVersions)
      .set({ definition: definition('second') })
      .where(eq(workflowVersions.id, id));
    expect(await read()).toEqual(compileGraph(definition('second')));
    expect(await redis.hget(versionKey, 'revision')).not.toBe(originalRevision);
    expect(await load()).toEqual(compileGraph(definition('wait')));
    await db.delete(workflowVersions).where(eq(workflowVersions.id, id));
    await expect(read()).rejects.toThrow(id);
    expect(await redis.exists(versionKey)).toBe(0);
  } finally {
    await redis.del(versionKey);
  }
}, 60000);
