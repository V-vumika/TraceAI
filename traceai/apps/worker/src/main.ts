import { client } from '@traceai/db';
import { StepDispatcher, stepRedisConnection } from '@traceai/engine';
import { createGraphRedis } from './graph-cache';
import { createStepWorker } from './worker';

const graphRedis = createGraphRedis(process.env);
graphRedis.on('error', (error) => console.warn('Graph cache connection error', error.message));
const connection = stepRedisConnection(process.env);
const dispatcher = new StepDispatcher({ connection });
const worker = createStepWorker(
  { connection: { ...connection, maxRetriesPerRequest: null } },
  graphRedis,
  (step, _job, graph) => {
    console.info('Claimed queued step', {
      stepId: step.id,
      runId: step.runId,
      nodeId: step.nodeId,
      parents: graph?.parents.get(step.nodeId),
    });
  },
  dispatcher,
);

worker.on('error', (error) => console.error('Worker connection error', error));
worker.on('failed', (job, error) => console.error('Step job failed', job?.id, error));

async function shutdown() {
  try {
    await worker.close();
  } finally {
    graphRedis.disconnect();
    await Promise.all([dispatcher.close(), client.end()]);
  }
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
