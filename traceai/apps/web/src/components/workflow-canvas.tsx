'use client';

import { useCallback, useEffect } from 'react';
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

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );
}

export function WorkflowCanvas() {
  const nodes = useGraphStore((state) => state.nodes);
  const edges = useGraphStore((state) => state.edges);
  const selectedNodeIds = useGraphStore((state) => state.selectedNodeIds);
  const onNodesChange = useGraphStore((state) => state.onNodesChange);
  const onEdgesChange = useGraphStore((state) => state.onEdgesChange);
  const onConnect = useGraphStore((state) => state.onConnect);
  const setSelection = useGraphStore((state) => state.setSelection);
  const selectAll = useGraphStore((state) => state.selectAll);
  const duplicateSelected = useGraphStore((state) => state.duplicateSelected);

  const handleSelectionChange = useCallback(
    ({ nodes: selected }: OnSelectionChangeParams) => {
      setSelection(selected.map((node) => node.id));
    },
    [setSelection],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      if (!(event.ctrlKey || event.metaKey)) return;

      const key = event.key.toLowerCase();

      if (key === 'a') {
        event.preventDefault();
        selectAll();
      }

      if (key === 'd') {
        event.preventDefault();
        duplicateSelected();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectAll, duplicateSelected]);

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
          <div className="space-y-1 rounded-md border bg-background px-3 py-2 text-sm">
            <p>
              {nodes.length} nodes · {edges.length} edges ·{' '}
              {selectedNodeIds.length} selected
            </p>
            <p className="text-xs text-muted-foreground">
              Del: delete · Ctrl+A: select all · Ctrl+D: duplicate
            </p>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}