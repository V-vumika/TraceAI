import { commonSettingsSchema, validateGraph, type Graph, type GraphProblem } from '@traceai/nodes';

export type Dependency = { source: string; sourceHandle: string | null };

export type CompiledGraph = {
  topologicalOrder: readonly string[];
  parents: ReadonlyMap<string, readonly string[]>;
  children: ReadonlyMap<string, readonly string[]>;
  dependencies: ReadonlyMap<string, readonly Dependency[]>;
  mergeAny: ReadonlySet<string>;
  continueOnError: ReadonlySet<string>;
};

const failureSettings = commonSettingsSchema.pick({ continueOnError: true });

type CompilerProblem = Omit<GraphProblem, 'code'> & {
  code: GraphProblem['code'] | 'duplicate-node-id';
};

export class GraphCompilationError extends Error {
  constructor(readonly problems: readonly CompilerProblem[]) {
    super(problems.map((problem) => problem.message).join(' '));
    this.name = 'GraphCompilationError';
  }
}

export function compileGraph(graph: Graph): CompiledGraph {
  const nodeIds = new Set<string>();
  const problems: CompilerProblem[] = [];

  for (const { id } of graph.nodes) {
    if (nodeIds.has(id)) {
      problems.push({
        code: 'duplicate-node-id',
        message: `Duplicate node ID: ${id}.`,
        nodeIds: [id],
        edgeIds: [],
      });
    }
    nodeIds.add(id);
  }

  if (nodeIds.size === 0) {
    problems.push({
      code: 'no-trigger',
      message: 'The workflow needs a trigger to start from.',
      nodeIds: [],
      edgeIds: [],
    });
  }

  if (problems.length > 0) throw new GraphCompilationError(problems);

  // The shared validator checks configuration, references, endpoints, and cycles.
  const graphProblems = validateGraph(graph);
  if (graphProblems.length > 0) throw new GraphCompilationError(graphProblems);

  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();
  const dependencies = new Map<string, Dependency[]>();
  const mergeAny = new Set<string>();
  const continueOnError = new Set<string>();
  for (const { id, data } of graph.nodes) {
    incoming.set(id, new Set());
    outgoing.set(id, new Set());
    dependencies.set(id, []);
    const settings = failureSettings.safeParse(data.settings ?? {});
    if (settings.success && settings.data.continueOnError) continueOnError.add(id);
    const config = data.config;
    if (
      data.nodeType === 'merge' &&
      typeof config === 'object' &&
      config !== null &&
      'mode' in config &&
      config.mode === 'any'
    ) {
      mergeAny.add(id);
    }
  }
  // Multiple handles between the same pair still represent one dependency.
  for (const { source, target, sourceHandle } of graph.edges) {
    incoming.get(target)?.add(source);
    outgoing.get(source)?.add(target);
    dependencies
      .get(target)
      ?.push({ source, sourceHandle: typeof sourceHandle === 'string' ? sourceHandle : null });
  }

  const parents = new Map([...incoming].map(([id, links]) => [id, [...links]]));
  const children = new Map([...outgoing].map(([id, links]) => [id, [...links]]));
  const remaining = new Map<string, number>();
  const topologicalOrder: string[] = [];

  for (const [id, links] of parents) {
    remaining.set(id, links.length);
    if (links.length === 0) topologicalOrder.push(id);
  }
  for (const id of topologicalOrder) {
    for (const child of children.get(id) ?? []) {
      const count = (remaining.get(child) ?? 0) - 1;
      remaining.set(child, count);
      if (count === 0) topologicalOrder.push(child);
    }
  }

  return { topologicalOrder, parents, children, dependencies, mergeAny, continueOnError };
}
