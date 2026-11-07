import { create } from 'zustand';
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';

type GraphState = {
  nodes: Node[];
  edges: Edge[];
  selectedNodeIds: string[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  setSelection: (ids: string[]) => void;
  selectAll: () => void;
  duplicateSelected: () => void;
  addNode: (
    item: { type: string; label: string },
    position: { x: number; y: number },
  ) => void;
  updateNodeConfig: (nodeId: string, config: Record<string, unknown>) => void;
};

const initialNodes: Node[] = [
  {
    id: '1',
    type: 'workflow',
    position: { x: 0, y: 0 },
    data: { label: 'Manual Trigger', nodeType: 'manual-trigger', status: 'idle' },
  },
  {
    id: '2',
    type: 'workflow',
    position: { x: 288, y: 0 },
    data: { label: 'LLM', nodeType: 'llm', status: 'idle' },
  },
  {
    id: '3',
    type: 'workflow',
    position: { x: 576, y: 0 },
    data: { label: 'HTTP Request', nodeType: 'http', status: 'idle' },
  },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e2-3', source: '2', target: '3' },
];

export const useGraphStore = create<GraphState>()((set) => ({
  nodes: initialNodes,
  edges: initialEdges,
  selectedNodeIds: [],

  onNodesChange: (changes) =>
    set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) })),

  onEdgesChange: (changes) =>
    set((state) => ({ edges: applyEdgeChanges(changes, state.edges) })),

  onConnect: (connection) =>
    set((state) => ({ edges: addEdge(connection, state.edges) })),

  setSelection: (ids) => set({ selectedNodeIds: ids }),

  selectAll: () =>
    set((state) => ({
      nodes: state.nodes.map((node) => ({ ...node, selected: true })),
    })),

  duplicateSelected: () =>
    set((state) => {
      const selected = state.nodes.filter((node) => node.selected);
      if (selected.length === 0) return state;

      const idMap = new Map<string, string>();
      const copies = selected.map((node) => {
        const newId = crypto.randomUUID();
        idMap.set(node.id, newId);
        return {
          ...node,
          id: newId,
          position: { x: node.position.x + 32, y: node.position.y + 32 },
          selected: true,
        };
      });

      const edgeCopies = state.edges.flatMap((edge) => {
        const source = idMap.get(edge.source);
        const target = idMap.get(edge.target);
        if (!source || !target) return [];
        return [
          { ...edge, id: crypto.randomUUID(), source, target, selected: false },
        ];
      });

      return {
        nodes: [
          ...state.nodes.map((node) => ({ ...node, selected: false })),
          ...copies,
        ],
        edges: [...state.edges, ...edgeCopies],
      };
    }),

  addNode: (item, position) =>
    set((state) => ({
      nodes: [
        ...state.nodes.map((node) => ({ ...node, selected: false })),
        {
          id: crypto.randomUUID(),
          type: 'workflow',
          position,
          data: { label: item.label, nodeType: item.type, status: 'idle' },
          selected: true,
        },
      ],
    })),

    updateNodeConfig: (nodeId, config) =>
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === nodeId ? { ...node, data: { ...node.data, config } } : node,
        ),
      })),
  
    updateNodeSettings: (nodeId, settings) =>
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, settings } }
            : node,
        ),
      })),
  }));