'use client';

import { nodeCatalog } from '@/lib/node-catalog';
import { useGraphStore } from '@/stores/graph-store';

export function NodeConfigPanel() {
  const nodes = useGraphStore((state) => state.nodes);
  const selectedNodeIds = useGraphStore((state) => state.selectedNodeIds);

  const selectedNode =
    selectedNodeIds.length === 1
      ? nodes.find((node) => node.id === selectedNodeIds[0])
      : undefined;

  let content;

  if (selectedNodeIds.length === 0) {
    content = (
      <p className="text-sm text-muted-foreground">
        Select a node to see its settings.
      </p>
    );
  } else if (!selectedNode) {
    content = (
      <p className="text-sm text-muted-foreground">
        {selectedNodeIds.length} nodes selected. Select one node to edit it.
      </p>
    );
  } else {
    const nodeType = String(selectedNode.data.nodeType ?? '');
    const label = String(selectedNode.data.label ?? '');
    const status = String(selectedNode.data.status ?? 'idle');
    const item = nodeCatalog.find((entry) => entry.type === nodeType);

    content = (
      <div className="space-y-4">
        <div>
          <p className="text-lg font-semibold tracking-tight">{label}</p>
          <p className="text-xs text-muted-foreground">
            {item?.category ?? 'Node'} · {status}
          </p>
        </div>

        {item && (
          <p className="text-sm text-muted-foreground">{item.description}</p>
        )}

        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          Settings form goes here (next task).
        </div>

        <p className="text-xs text-muted-foreground">
          ID: {selectedNode.id}
        </p>
      </div>
    );
  }

  return (
    <aside className="h-screen w-80 shrink-0 overflow-y-auto border-l bg-background p-4">
      <h2 className="mb-4 text-sm font-semibold tracking-tight">Settings</h2>
      {content}
    </aside>
  );
}