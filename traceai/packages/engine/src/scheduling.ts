import type { CompiledGraph } from './compiler';

type ParentStep = { status: string; branch: string | null };

export function nextPendingStatus(
  graph: CompiledGraph,
  nodeId: string,
  steps: ReadonlyMap<string, ParentStep>,
): 'pending' | 'queued' | 'skipped' {
  const dependencies = graph.dependencies.get(nodeId);
  if (!dependencies?.length) return 'pending';

  let hasSuccess = false;
  let hasUnresolved = false;
  for (const { source, sourceHandle } of dependencies) {
    const step = steps.get(source);
    if (step?.status === 'skipped') continue;
    if (step?.status === 'succeeded') {
      if (step.branch !== null && sourceHandle !== null && step.branch !== sourceHandle) continue;
      hasSuccess = true;
    } else {
      hasUnresolved = true;
    }
  }

  if (hasSuccess && (!hasUnresolved || graph.mergeAny.has(nodeId))) return 'queued';
  if (!hasSuccess && !hasUnresolved) return 'skipped';
  return 'pending';
}
