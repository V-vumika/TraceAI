import { getNodeDefinition } from './definitions';
import { expressionFunctions, expressionVariables } from './expression-hints';

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
  | 'cycle'
  | 'no-trigger'
  | 'disconnected'
  | 'dangling-edge'
  | 'invalid-config'
  | 'invalid-json'
  | 'bad-reference';

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

// Fields that must hold valid JSON, per node type.
const JSON_FIELDS: Record<string, string[]> = {
  http: ['headers'],
};

// Fields that are real code, not {{ }} text.
const SKIP_REFERENCE_FIELDS = new Set(['code']);

const KNOWN_NAMES = new Set<string>([
  ...expressionVariables.map((variable) => variable.name),
  ...expressionFunctions.map((fn) => fn.name),
  'true',
  'false',
  'null',
]);

function getNodeType(node: GraphNode | undefined) {
  const nodeType = node?.data.nodeType;
  return typeof nodeType === 'string' ? nodeType : '';
}

function isTrigger(node: GraphNode | undefined) {
  return getNodeDefinition(getNodeType(node))?.category === 'Triggers';
}

function getConfig(node: GraphNode): Record<string, unknown> {
  const config = node.data.config;
  return typeof config === 'object' && config !== null
    ? (config as Record<string, unknown>)
    : {};
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

// Node ids that no trigger can reach.
function findUnreachable(graph: Graph): string[] {
  const triggerIds = graph.nodes.filter(isTrigger).map((node) => node.id);
  if (triggerIds.length === 0) return [];

  const reached = new Set<string>(triggerIds);
  const stack = [...triggerIds];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;

    for (const edge of graph.edges) {
      if (edge.source === current && !reached.has(edge.target)) {
        reached.add(edge.target);
        stack.push(edge.target);
      }
    }
  }

  return graph.nodes
    .filter((node) => !reached.has(node.id))
    .map((node) => node.id);
}

// Names used inside {{ }} that are not in the allowed list.
function findUnknownNames(text: string): string[] {
  const unknown = new Set<string>();
  const pattern = /\{\{([\s\S]*?)\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const inner = (match[1] ?? '')
      .replace(/'[^']*'|"[^"]*"/g, ' ') // ignore text in quotes
      .replace(/\.\s*[A-Za-z_]\w*/g, ' '); // input.name: only check "input"

    for (const word of inner.match(/[A-Za-z_]\w*/g) ?? []) {
      if (!KNOWN_NAMES.has(word)) unknown.add(word);
    }
  }

  return [...unknown];
}

function checkNodeConfig(node: GraphNode): GraphProblem[] {
  const nodeType = getNodeType(node);
  const definition = getNodeDefinition(nodeType);
  if (!definition) return [];

  const config = getConfig(node);
  const problems: GraphProblem[] = [];

  const result = definition.configSchema.safeParse(config);
  if (!result.success) {
    for (const issue of result.error.issues) {
        const field = issue.path.join('.') || 'config';
        const value = config[String(issue.path[0] ?? '')];
        const message =
          value === undefined || value === '' ? 'is required' : issue.message;
      problems.push({
        code: 'invalid-config',
        message: `${field}: ${message}`,
        nodeIds: [node.id],
        edgeIds: [],
      });
    }
  }

  for (const field of JSON_FIELDS[nodeType] ?? []) {
    const value = config[field];
    if (typeof value !== 'string' || value.trim() === '') continue;

    try {
      JSON.parse(value);
    } catch {
      problems.push({
        code: 'invalid-json',
        message: `${field}: is not valid JSON`,
        nodeIds: [node.id],
        edgeIds: [],
      });
    }
  }

  for (const [field, value] of Object.entries(config)) {
    if (typeof value !== 'string' || SKIP_REFERENCE_FIELDS.has(field)) continue;

    for (const name of findUnknownNames(value)) {
      problems.push({
        code: 'bad-reference',
        message: `${field}: unknown name ${name} inside {{ }}`,
        nodeIds: [node.id],
        edgeIds: [],
      });
    }
  }

  return problems;
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
      continue;
    }

    problems.push(...checkNodeConfig(node));
  }

  for (const edge of graph.edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) {
      problems.push({
        code: 'dangling-edge',
        message: 'This connection points to a node that does not exist.',
        nodeIds: [],
        edgeIds: [edge.id],
      });
      continue;
    }

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

  const hasTrigger = graph.nodes.some(isTrigger);

  if (graph.nodes.length > 0 && !hasTrigger) {
    problems.push({
      code: 'no-trigger',
      message: 'The workflow needs a trigger to start from.',
      nodeIds: [],
      edgeIds: [],
    });
  }

  for (const id of findUnreachable(graph)) {
    problems.push({
      code: 'disconnected',
      message: 'This node is not connected to a trigger.',
      nodeIds: [id],
      edgeIds: [],
    });
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