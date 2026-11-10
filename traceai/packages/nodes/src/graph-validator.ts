import { getNodeDefinition } from './definitions';

export type GraphNode = {
  id: string;
  data: Record<string, unknown>;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
};

export type Graph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type GraphProblemCode =
  | 'unknown-node-type'
  | 'self-loop'
  | 'trigger-incoming'
  | 'cycle';

export type GraphProblem = {
  code: GraphProblemCode;
  message: string;
  nodeIds: string[];
  edgeIds: string[];
};

type Link = { source: string; target: string };

const MESSAGES = {
  selfLoop: 'A node cannot connect to itself.',
  triggerIncoming: 'A trigger cannot have an incoming connection.',
  cycle: 'This connection would create a cycle.',
  graphCycle: 'The workflow contains a cycle.',
};

function getNodeType(node: GraphNode | undefined) {
  const nodeType = node?.data.nodeType;
  return typeof nodeType === 'string' ? nodeType : '';
}

function isTrigger(node: GraphNode | undefined) {
  return getNodeDefinition(getNodeType(node))?.category === 'Triggers';
}

// Walks the whole graph. Returns the node ids of one cycle, or null.
function findCycle(graph: Graph): string[] | null {
  const next = new Map<string, string[]>();
  for (const node of graph.nodes) next.set(node.id, []);
  for (const edge of graph.edges) {
    if (edge.source === edge.target) continue; // self-loops are reported separately
    next.get(edge.source)?.push(edge.target);
  }

  const state = new Map<string, 'visiting' | 'done'>();
  const path: string[] = [];

  function visit(id: string): string[] | null {
    state.set(id, 'visiting');
    path.push(id);

    for (const target of next.get(id) ?? []) {
      if (state.get(target) === 'visiting') {
        return path.slice(path.indexOf(target));
      }
      if (!state.has(target)) {
        const cycle = visit(target);
        if (cycle) return cycle;
      }
    }

    path.pop();
    state.set(id, 'done');
    return null;
  }

  for (const node of graph.nodes) {
    if (!state.has(node.id)) {
      const cycle = visit(node.id);
      if (cycle) return cycle;
    }
  }

  return null;
}

// Can we walk from "from" to "to" using the given edges?
function canReach(from: string, to: string, edges: GraphEdge[]) {
  const stack = [from];
  const seen = new Set<string>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    if (current === to) return true;
    if (seen.has(current)) continue;
    seen.add(current);

    for (const edge of edges) {
      if (edge.source === current) stack.push(edge.target);
    }
  }

  return false;
}

// Live check while the user draws one edge.
// Returns a reason if the edge is not allowed, otherwise null.
export function getConnectionError(
  link: Link,
  nodes: GraphNode[],
  edges: GraphEdge[],
): string | null {
  if (link.source === link.target) return MESSAGES.selfLoop;

  const targetNode = nodes.find((node) => node.id === link.target);
  if (isTrigger(targetNode)) return MESSAGES.triggerIncoming;

  if (canReach(link.target, link.source, edges)) return MESSAGES.cycle;

  return null;
}

// Full check of a saved graph. Returns every problem found.
export function validateGraph(graph: Graph): GraphProblem[] {
  const problems: GraphProblem[] = [];
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

  for (const node of graph.nodes) {
    const nodeType = getNodeType(node);
    if (!getNodeDefinition(nodeType)) {
      problems.push({
        code: 'unknown-node-type',
        message: `Unknown node type: ${nodeType || '(missing)'}`,
        nodeIds: [node.id],
        edgeIds: [],
      });
    }
  }

  for (const edge of graph.edges) {
    if (edge.source === edge.target) {
      problems.push({
        code: 'self-loop',
        message: MESSAGES.selfLoop,
        nodeIds: [edge.source],
        edgeIds: [edge.id],
      });
      continue;
    }

    if (isTrigger(nodeById.get(edge.target))) {
      problems.push({
        code: 'trigger-incoming',
        message: MESSAGES.triggerIncoming,
        nodeIds: [edge.target],
        edgeIds: [edge.id],
      });
    }
  }

  const cycle = findCycle(graph);
  if (cycle) {
    const edgeIds = cycle.flatMap((from, index) => {
      const to = cycle[(index + 1) % cycle.length];
      const edge = graph.edges.find(
        (entry) => entry.source === from && entry.target === to,
      );
      return edge ? [edge.id] : [];
    });

    problems.push({
      code: 'cycle',
      message: MESSAGES.graphCycle,
      nodeIds: cycle,
      edgeIds,
    });
  }

  return problems;
}