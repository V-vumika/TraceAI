import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';
import { loadRunGraph } from './run-graph';
import type { StepJob } from '@traceai/engine';
import { claimStep, type ClaimedStep } from './claim';
import { processStepJob } from './worker';

vi.mock('@traceai/db', () => ({ db: { transaction: (fn: (tx: object) => unknown) => fn({}) } }));
vi.mock('./run-graph', () => ({ loadRunGraph: vi.fn() }));
vi.mock('./claim', () => ({ claimStep: vi.fn() }));
const job: StepJob = { runId: 'run', nodeId: 'step', iteration: 0, attempt: 1 };
const claimed: ClaimedStep = {
  id: 'row',
  runId: job.runId,
  nodeId: job.nodeId,
  iteration: job.iteration,
  status: 'running',
  startedAt: new Date(),
  createdAt: new Date(),
  finishedAt: null,
  input: null,
  output: null,
  error: null,
};

const redis = {} as Redis;
const loadGraph = vi.mocked(loadRunGraph);

describe('step job processor', () => {
  beforeEach(() => vi.resetAllMocks());

  it('calls the handler with the returned row and waits for its outcome', async () => {
    vi.mocked(claimStep).mockResolvedValue(claimed);
    const graph = { topologicalOrder: ['step'], parents: new Map(), children: new Map() };
    loadGraph.mockResolvedValue(graph);
    const failure = new Error('handler failed');
    const handler = vi.fn().mockRejectedValue(failure);
    await expect(processStepJob(job, redis, handler)).rejects.toBe(failure);
    expect(claimStep).toHaveBeenCalledWith(job, {});
    expect(handler).toHaveBeenCalledExactlyOnceWith(claimed, job, graph);
    expect(loadGraph).toHaveBeenCalledWith(redis, job.runId, {});
  });

  it('propagates a graph load failure without entering the handler', async () => {
    const failure = new Error('source unavailable');
    vi.mocked(claimStep).mockResolvedValue(claimed);
    loadGraph.mockRejectedValue(failure);
    const handler = vi.fn();
    await expect(processStepJob(job, redis, handler)).rejects.toBe(failure);
    expect(handler).not.toHaveBeenCalled();
  });

  it('acknowledges an unmatched claim without invoking the handler', async () => {
    vi.mocked(claimStep).mockResolvedValue(undefined);
    const handler = vi.fn();
    await expect(processStepJob(job, redis, handler)).resolves.toBeUndefined();
    expect(loadGraph).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it('propagates database errors to BullMQ and skips processing', async () => {
    const failure = new Error('database unavailable');
    vi.mocked(claimStep).mockRejectedValue(failure);
    const handler = vi.fn();
    await expect(processStepJob(job, redis, handler)).rejects.toBe(failure);
    expect(handler).not.toHaveBeenCalled();
  });
});
