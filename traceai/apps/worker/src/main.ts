import { client } from '@traceai/db';
import { stepRedisConnection } from '@traceai/engine';
import { createStepWorker } from './worker';

const worker = createStepWorker(
  { connection: { ...stepRedisConnection(process.env), maxRetriesPerRequest: null } },
  (step) => {
    console.info('Claimed queued step', {
      stepId: step.id,
      runId: step.runId,
      nodeId: step.nodeId,
    });
  },
);

worker.on('error', (error) => console.error('Worker connection error', error));
worker.on('failed', (job, error) => console.error('Step job failed', job?.id, error));

async function shutdown() {
  try {
    await worker.close();
  } finally {
    await client.end();
  }
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
