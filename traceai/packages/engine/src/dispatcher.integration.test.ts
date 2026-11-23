import { randomUUID } from 'node:crypto';
import { Queue, Worker } from 'bullmq';
import { expect, it } from 'vitest';
import {
  StepDispatcher,
  stepJobId,
  stepQueueName,
  stepRedisConnection,
  type StepJob,
} from './dispatcher';

it('delivers each ready step attempt once across repeated Redis publishes', async () => {
  const options = {
    connection: {
      ...stepRedisConnection(process.env),
      maxRetriesPerRequest: null,
      connectTimeout: 3000,
      retryStrategy: () => null,
    },
    prefix: 'traceai-test-' + randomUUID(),
  };
  const dispatcher = new StepDispatcher(options);
  const queue = new Queue(stepQueueName, options);
  const worker = new Worker<StepJob>(stepQueueName, null, { ...options, autorun: false });
  const runId = randomUUID();
  const steps = ['classify:ticket', 'notify'].map((nodeId) => ({
    runId,
    nodeId,
    iteration: 0,
    attempt: 1,
  }));
  try {
    await dispatcher.enqueue(steps);
    await dispatcher.enqueue(steps);
    expect(await queue.getWaitingCount()).toBe(2);
    for (const expected of steps) {
      const token = randomUUID();
      const job = await worker.getNextJob(token, { block: false });
      if (!job) throw new Error('Expected a ready step job.');
      expect(job.id).toBe(stepJobId(expected));
      expect(job.data).toEqual(expected);
      await job.moveToCompleted('verified', token, false);
    }
    await dispatcher.enqueue(steps);
    expect(await queue.getWaitingCount()).toBe(0);
    expect(await queue.getCompletedCount()).toBe(2);
  } finally {
    await worker.close();
    await dispatcher.close();
    await queue.obliterate({ force: true });
    await queue.close();
  }
}, 30000);
