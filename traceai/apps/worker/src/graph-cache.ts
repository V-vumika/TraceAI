import { Redis } from 'ioredis';
import { stepRedisConnection, type CompiledGraph } from '@traceai/engine';

const ttlSeconds = 60 * 60;

export function createGraphRedis(env: NodeJS.ProcessEnv) {
  const connection = stepRedisConnection(env);
  // A slow or reconnecting cache must not stall a step.
  const options = { enableOfflineQueue: false, commandTimeout: 2500, connectTimeout: 3000 };
  return connection.url
    ? new Redis(connection.url, options)
    : new Redis({ ...connection, ...options });
}

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function unpack(payload: string): CompiledGraph | undefined {
  const entries: unknown = JSON.parse(payload);
  if (!Array.isArray(entries) || entries.length === 0) return;
  const topologicalOrder: string[] = [];
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const entry of entries) {
    if (!Array.isArray(entry)) return;
    const [id, incoming, outgoing] = entry;
    if (typeof id !== 'string' || parents.has(id) || !stringList(incoming) || !stringList(outgoing))
      return;
    topologicalOrder.push(id);
    parents.set(id, incoming);
    children.set(id, outgoing);
  }
  return { topologicalOrder, parents, children };
}

type LoadedGraph = { revision: string; graph: CompiledGraph };

export async function cachedGraph(
  redis: Redis,
  versionId: string,
  revision: string | undefined,
  load: () => Promise<LoadedGraph | undefined>,
): Promise<CompiledGraph> {
  const key = 'graph:' + versionId;
  if (revision !== undefined) {
    try {
      const [storedRevision, payload] = await redis.hmget(key, 'revision', 'compiled-v1');
      if (storedRevision === revision && payload) {
        const graph = unpack(payload);
        if (graph) return graph;
      }
    } catch {
      // Redis errors and unreadable cache entries are misses.
    }
    const current = await load();
    if (current) {
      const { graph } = current;
      const entries = graph.topologicalOrder.map((id) => [
        id,
        graph.parents.get(id),
        graph.children.get(id),
      ]);
      // Publish the value and expiry together. The graph is usable even if Redis goes away.
      await redis
        .multi()
        .hset(key, 'revision', current.revision, 'compiled-v1', JSON.stringify(entries))
        .expire(key, ttlSeconds)
        .exec()
        .catch(() => undefined);
      return graph;
    }
  }
  await redis.del(key).catch(() => undefined);
  throw new Error('Workflow version ' + versionId + ' does not exist.');
}
