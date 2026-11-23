import { Queue, type QueueOptions } from 'bullmq';

export const stepQueueName = 'steps';

export type StepJob = {
  runId: string;
  nodeId: string;
  iteration: number;
  attempt: number;
};

export function stepJobId({ runId, nodeId, iteration, attempt }: StepJob): string {
  // BullMQ reserves colons in custom IDs. Encode the complete logical key.
  return encodeURIComponent([runId, nodeId, iteration, attempt].join(':'));
}

export function stepRedisConnection(env: NodeJS.ProcessEnv) {
  return env.REDIS_URL
    ? { url: env.REDIS_URL }
    : { host: env.REDIS_HOST ?? '127.0.0.1', port: Number(env.REDIS_PORT ?? 6379) };
}

export class StepDispatcher {
  private queue?: Queue<StepJob>;

  constructor(private readonly options: QueueOptions) {}

  private getQueue(): Queue<StepJob> {
    if (!this.queue) this.queue = new Queue<StepJob>(stepQueueName, this.options);
    return this.queue;
  }

  async enqueue(steps: StepJob[]): Promise<void> {
    if (steps.length === 0) return;
    const jobs = steps.map((data) => ({
      name: 'step',
      data,
      opts: { jobId: stepJobId(data) },
    }));

    // Retry an uncertain write once with identical IDs. Redis may already
    // have accepted some or all of the batch when the connection failed.
    for (let delivery = 1; delivery <= 2; delivery++) {
      const queue = this.getQueue();
      try {
        await queue.addBulk(jobs);
        return;
      } catch (error) {
        if (this.queue === queue) await this.close();
        if (delivery === 2) throw error;
      }
    }
  }

  async close(): Promise<void> {
    const queue = this.queue;
    this.queue = undefined;
    await queue?.close();
  }
}
