import { and, eq, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { db, workflowRuns, workflowVersions } from '@traceai/db';
import { compileGraph } from '@traceai/engine';
import { cachedGraph } from './graph-cache';

type GraphReader = Pick<typeof db, 'select' | 'query'>;

// A PostgreSQL row's xmin changes when it is updated. Check only this small
// token on hits, so even out-of-band updates cannot serve a stale definition.
const revision = sql<string>`xmin::text`;

export async function loadVersionGraph(
  redis: Redis,
  workflowId: string,
  versionId: string,
  connection: GraphReader = db,
) {
  const version = and(
    eq(workflowVersions.id, versionId),
    eq(workflowVersions.workflowId, workflowId),
  );
  const [ref] = await connection.select({ revision }).from(workflowVersions).where(version);
  return cachedGraph(redis, versionId, ref?.revision, async () => {
    const [row] = await connection
      .select({ revision, definition: workflowVersions.definition })
      .from(workflowVersions)
      .where(version);
    if (!row) return;
    // Run creation has already validated this published graph. Read the revision
    // alongside the definition so that a concurrent change gets the right tag.
    return {
      revision: row.revision,
      graph: compileGraph(row.definition as Parameters<typeof compileGraph>[0]),
    };
  });
}

export async function loadRunGraph(redis: Redis, runId: string, connection: GraphReader = db) {
  const run = await connection.query.workflowRuns.findFirst({
    where: eq(workflowRuns.id, runId),
    columns: { workflowId: true, workflowVersionId: true },
  });
  // Earlier runs may have no pinned version. Preserve their claim behavior.
  if (run?.workflowVersionId)
    return loadVersionGraph(redis, run.workflowId, run.workflowVersionId, connection);
  return undefined;
}
