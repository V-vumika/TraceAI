'use client';

import { useState } from 'react';
import { Panel, useReactFlow } from '@xyflow/react';
import { getGraphProblems } from '@/lib/graph-problems';
import { useGraphStore } from '@/stores/graph-store';

export function ProblemsList() {
  const { fitView } = useReactFlow();
  const [open, setOpen] = useState(true);

  const nodes = useGraphStore((state) => state.nodes);
  const problems = useGraphStore((state) =>
    getGraphProblems(state.nodes, state.edges),
  );
  const onNodesChange = useGraphStore((state) => state.onNodesChange);

  function focusNode(nodeId: string) {
    onNodesChange(
      nodes.map((node) => ({
        id: node.id,
        type: 'select' as const,
        selected: node.id === nodeId,
      })),
    );
    fitView({ nodes: [{ id: nodeId }], duration: 300, maxZoom: 1.2 });
  }

  return (
    <Panel position="top-right">
      <div className="w-72 rounded-md border bg-background text-sm">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex w-full items-center justify-between px-3 py-2 font-medium"
        >
          <span>Problems</span>
          <span
            className={
              problems.length > 0
                ? 'rounded-full bg-red-500 px-2 text-xs text-white'
                : 'rounded-full bg-green-500/15 px-2 text-xs text-green-600 dark:text-green-400'
            }
          >
            {problems.length}
          </span>
        </button>

        {open && (
          <div className="max-h-64 overflow-y-auto border-t">
            {problems.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                No problems found.
              </p>
            )}

            {problems.map((problem, index) => {
              const nodeId = problem.nodeIds[0];
              const node = nodes.find((entry) => entry.id === nodeId);
              const title = node ? String(node.data.label ?? 'Node') : 'Workflow';
              const key = `${problem.code}-${problem.nodeIds.join(',')}-${index}`;

              const body = (
                <>
                  <p className="text-xs font-medium">{title}</p>
                  <p className="text-xs text-muted-foreground">
                    {problem.message}
                  </p>
                </>
              );

              if (!nodeId) {
                return (
                  <div key={key} className="border-b px-3 py-2 last:border-b-0">
                    {body}
                  </div>
                );
              }

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => focusNode(nodeId)}
                  className="block w-full border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted"
                >
                  {body}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Panel>
  );
}