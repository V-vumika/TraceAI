import { describe, expect, it, vi } from 'vitest';
import { StepDispatcher, stepJobId } from './dispatcher';

const queue = vi.hoisted(() => ({ addBulk: vi.fn(), close: vi.fn() }));
vi.mock('bullmq', () => ({
  Queue: class {
    addBulk = queue.addBulk;
    close = queue.close;
  },
}));

const job = { runId: 'run-a', nodeId: 'node:b%3A', iteration: 0, attempt: 1 };

describe('step dispatch', () => {
  it('encodes the logical ID without collisions between node IDs, iterations or attempts', () => {
    const id = stepJobId(job);
    expect(decodeURIComponent(id)).toBe('run-a:node:b%3A:0:1');
    expect(id).not.toContain(':');
    expect(
      new Set([
        id,
        stepJobId({ ...job, nodeId: 'node%3Ab%3A' }),
        stepJobId({ ...job, iteration: 1 }),
        stepJobId({ ...job, attempt: 2 }),
      ]).size,
    ).toBe(4);
  });

  it('skips an empty batch and retries an uncertain delivery with the same IDs', async () => {
    const dispatcher = new StepDispatcher({ connection: {} });
    queue.addBulk
      .mockReset()
      .mockRejectedValueOnce(new Error('lost response'))
      .mockResolvedValueOnce([]);
    await dispatcher.enqueue([]);
    expect(queue.addBulk).not.toHaveBeenCalled();
    await dispatcher.enqueue([job]);
    expect(queue.addBulk).toHaveBeenCalledTimes(2);
    expect(queue.addBulk.mock.calls[0]).toEqual(queue.addBulk.mock.calls[1]);
    expect(queue.addBulk).toHaveBeenCalledWith([
      { name: 'step', data: job, opts: { jobId: stepJobId(job) } },
    ]);
    await dispatcher.close();
  });

  it('surfaces a persistent failure after two delivery attempts', async () => {
    const dispatcher = new StepDispatcher({ connection: {} });
    queue.addBulk.mockReset().mockRejectedValue(new Error('Redis unavailable'));
    await expect(dispatcher.enqueue([job])).rejects.toThrow('Redis unavailable');
    expect(queue.addBulk).toHaveBeenCalledTimes(2);
    await dispatcher.close();
  });
});
