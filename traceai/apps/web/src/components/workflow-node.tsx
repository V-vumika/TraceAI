'use client';

import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { getNodeProblemText } from '@/lib/graph-problems';
import { nodeCatalog } from '@/lib/node-catalog';
import { cn } from '@/lib/utils';
import { useGraphStore } from '@/stores/graph-store';

export type NodeStatus = 'idle' | 'running' | 'success' | 'error';

export type WorkflowNodeData = {
  label: string;
  nodeType: string;
  status: NodeStatus;
};

export type WorkflowNodeType = Node<WorkflowNodeData, 'workflow'>;

const statusStyles: Record<NodeStatus, string> = {
  idle: 'bg-muted text-muted-foreground',
  running: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  success: 'bg-green-500/15 text-green-600 dark:text-green-400',
  error: 'bg-red-500/15 text-red-600 dark:text-red-400',
};

const handleStyle = { width: 10, height: 10 };

export function WorkflowNode({
  id,
  data,
  selected,
}: NodeProps<WorkflowNodeType>) {
  const problemText = useGraphStore((state) =>
    getNodeProblemText(state.nodes, state.edges, id),
  );
  const hasProblems = problemText !== '';

  const item = nodeCatalog.find((entry) => entry.type === data.nodeType);
  const isTrigger = item?.category === 'Triggers';

  return (
    <div
      className={cn(
        'relative min-w-[170px] rounded-lg border bg-card px-3 py-2 shadow-sm',
        hasProblems && 'border-red-500',
        selected && 'ring-2 ring-primary',
      )}
    >
      {hasProblems && (
        <span
          title={problemText}
          className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold text-white"
        >
          {problemText.split('\n').length}
        </span>
      )}

      {!isTrigger && (
        <Handle type="target" position={Position.Left} style={handleStyle} />
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{data.label}</p>
          <p className="text-xs text-muted-foreground">
            {item?.category ?? 'Node'}
          </p>
        </div>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs',
            statusStyles[data.status],
          )}
        >
          {data.status}
        </span>
      </div>

      <Handle type="source" position={Position.Right} style={handleStyle} />
    </div>
  );
}