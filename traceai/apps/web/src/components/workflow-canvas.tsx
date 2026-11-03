'use client';

import { useCallback, useEffect, type DragEvent } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Edge,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { WorkflowNode } from '@/components/workflow-node';
import { getConnectionError } from '@/lib/connection-rules';
import { NODE_DRAG_TYPE, nodeCatalog } from '@/lib/node-catalog';
import { useGraphStore } from '@/stores/graph-store';

const GRID = 16;

const nodeTypes = { workflow: WorkflowNode };

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );
}

function Canvas() {
  const { screenToFlowPosition } = useReactFlow();

  const nodes = useGraphStore((state) => state.nodes);
  const edges = useGraphStore((state) => state.edges);
  const selectedNodeIds = useGraphStore((state) => state.selectedNodeIds);
  const onNodesChange = useGraphStore((state) => state.onNodesChange);
  const onEdgesChange = useGraphStore((state) => state.onEdgesChange);
  const onConnect = useGraphStore((state) => state.onConnect);
  const setSelection = useGraphStore((state) => state.setSelection);
  const selectAll = useGraphStore((state) => state.selectAll);
  const duplicateSelected = useGraphStore((state) => state.duplicateSelected);
  const addNode = useGraphStore((state) => state.addNode);

  const handleSelectionChange = useCallback(
    ({ nodes: selected }: OnSelectionChangeParams) => {
      setSelection(selected.map((node) => node.id));
    },
    [setSelection],
  );

  const isValidConnection = useCallback((connection: Connection | Edge) => {
    const { nodes: currentNodes, edges: currentEdges } =
      useGraphStore.getState();
    return getConnectionError(connection, currentNodes, currentEdges) === null;
  }, []);

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();

    const type = event.dataTransfer.getData(NODE_DRAG_TYPE);
    if (!type) return;

    const item = nodeCatalog.find((entry) => entry.type === type);
    if (!item) return;

    const position = screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });

    addNode(item, {
      x: Math.round(position.x / GRID) * GRID,
      y: Math.round(position.y / GRID) * GRID,
    });
  }

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
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onSelectionChange={handleSelectionChange}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        snapToGrid
        snapGrid={[GRID, GRID]}
        colorMode="system"
        fitView
      >
        <Background gap={GRID} />
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

export function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <Canvas />
    </ReactFlowProvider>
  );
}