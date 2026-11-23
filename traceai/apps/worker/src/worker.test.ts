import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StepJob } from '@traceai/engine';
import { claimStep, type ClaimedStep } from './claim';
import { processStepJob } from './worker';

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

describe('step job processor', () => {
  beforeEach(() => vi.resetAllMocks());

  it('calls the handler with the returned row and waits for its outcome', async () => {
    vi.mocked(claimStep).mockResolvedValue(claimed);
    const failure = new Error('handler failed');
    const handler = vi.fn().mockRejectedValue(failure);
    await expect(processStepJob(job, handler)).rejects.toBe(failure);
    expect(claimStep).toHaveBeenCalledWith(job);
    expect(handler).toHaveBeenCalledExactlyOnceWith(claimed, job);
  });

  it('acknowledges an unmatched claim without invoking the handler', async () => {
    vi.mocked(claimStep).mockResolvedValue(undefined);
    const handler = vi.fn();
    await expect(processStepJob(job, handler)).resolves.toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it('propagates database errors to BullMQ and skips processing', async () => {
    const failure = new Error('database unavailable');
    vi.mocked(claimStep).mockRejectedValue(failure);
    const handler = vi.fn();
    await expect(processStepJob(job, handler)).rejects.toBe(failure);
    expect(handler).not.toHaveBeenCalled();
  });
});
