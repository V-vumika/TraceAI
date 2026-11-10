import { validateGraph, type GraphProblem } from '@traceai/nodes';
import type { Edge, Node } from '@xyflow/react';

// validateGraph runs on every change, and many components ask for the result.
// We remember the last answer and reuse it while nodes and edges are the same.
let lastNodes: Node[] | undefined;
let lastEdges: Edge[] | undefined;
let lastProblems: GraphProblem[] = [];

export function getGraphProblems(nodes: Node[], edges: Edge[]): GraphProblem[] {
  if (nodes === lastNodes && edges === lastEdges) return lastProblems;

  lastNodes = nodes;
  lastEdges = edges;
  lastProblems = validateGraph({ nodes, edges });
  return lastProblems;
}

// One line of text per problem, for one node. It returns text (not a list)
// because Zustand re-renders when a selector returns a new object, and
// a new list is a new object every time. Same text is the same value.
export function getNodeProblemText(
  nodes: Node[],
  edges: Edge[],
  nodeId: string,
): string {
  return getGraphProblems(nodes, edges)
    .filter((problem) => problem.nodeIds.includes(nodeId))
    .map((problem) => problem.message)
    .join('\n');
}