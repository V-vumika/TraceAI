'use client';

import { useCallback } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useGraphStore } from '@/stores/graph-store';

export function WorkflowCanvas() {
  const nodes = useGraphStore((state) => state.nodes);
  const edges = useGraphStore((state) => state.edges);
  const selectedNodeIds = useGraphStore((state) => state.selectedNodeIds);
  const onNodesChange = useGraphStore((state) => state.onNodesChange);
  const onEdgesChange = useGraphStore((state) => state.onEdgesChange);
  const onConnect = useGraphStore((state) => state.onConnect);
  const setSelection = useGraphStore((state) => state.setSelection);

  const handleSelectionChange = useCallback(
    ({ nodes: selected }: OnSelectionChangeParams) => {
      setSelection(selected.map((node) => node.id));
    },
    [setSelection],
  );

  return (
    <div className="h-screen w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={handleSelectionChange}
        snapToGrid
        snapGrid={[16, 16]}
        colorMode="system"
        fitView
      >
        <Background gap={16} />
        <Controls />
        <MiniMap pannable zoomable />
        <Panel position="top-left">
          <div className="rounded-md border bg-background px-3 py-2 text-sm">
            {nodes.length} nodes · {edges.length} edges · {selectedNodeIds.length}{' '}
            selected
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}