import type { Edge, Node } from '@xyflow/react';

export type SavedNode = {
  id: string;
  type?: string | undefined;
  position: { x: number; y: number };
  data: Record<string, unknown>;
};

export type SavedEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null | undefined;
  targetHandle?: string | null | undefined;
};

export type SavedGraph = {
  nodes: SavedNode[];
  edges: SavedEdge[];
};

// What goes to the database: only what defines the graph.
// UI-only fields (selected, dragging, measured size) and run status stay out.
export function serializeGraph(nodes: Node[], edges: Edge[]): SavedGraph {
  return {
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: { x: node.position.x, y: node.position.y },
      data: Object.fromEntries(
        Object.entries(node.data).filter(([key]) => key !== 'status'),
      ),
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
    })),
  };
}

// The reverse. The saved value comes from the database, so we do not trust its shape.
export function deserializeGraph(value: unknown): {
  nodes: Node[];
  edges: Edge[];
} {
  const saved = (
    typeof value === 'object' && value !== null ? value : {}
  ) as Partial<SavedGraph>;

  const savedNodes = Array.isArray(saved.nodes) ? saved.nodes : [];
  const savedEdges = Array.isArray(saved.edges) ? saved.edges : [];

  return {
    nodes: savedNodes.map((node) => ({
      id: node.id,
      type: node.type ?? 'workflow',
      position: node.position,
      data: { ...node.data, status: 'idle' },
    })),
    edges: savedEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
    })),
  };
}