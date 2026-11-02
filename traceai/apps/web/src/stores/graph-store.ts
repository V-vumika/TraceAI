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
};

const initialNodes: Node[] = [
  { id: '1', position: { x: 0, y: 0 }, data: { label: 'Manual Trigger' } },
  { id: '2', position: { x: 240, y: 0 }, data: { label: 'LLM' } },
  { id: '3', position: { x: 480, y: 0 }, data: { label: 'HTTP' } },
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
}));