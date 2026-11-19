'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { NodeConfigPanel } from '@/components/node-config-panel';
import { NodePalette } from '@/components/node-palette';
import { WorkflowCanvas } from '@/components/workflow-canvas';
import {
  ApiError,
  apiFetch,
  type SaveDraftResponse,
  type WorkflowResponse,
} from '@/lib/api';
import { deserializeGraph, serializeGraph } from '@/lib/graph-serialize';
import { useGraphStore } from '@/stores/graph-store';

const SAVE_DELAY_MS = 1000;
const RETRY_DELAY_MS = 5000;

type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error';

const statusText: Record<SaveStatus, string> = {
  saved: 'Saved',
  unsaved: 'Unsaved changes',
  saving: 'Saving...',
  error: 'Save failed, retrying...',
};

function currentSnapshot() {
  const { nodes, edges } = useGraphStore.getState();
  return JSON.stringify(serializeGraph(nodes, edges));
}

function CenteredMessage({ text }: { text: string }) {
  return (
    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

export function WorkflowEditor({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const loadGraph = useGraphStore((state) => state.loadGraph);

  const [status, setStatus] = useState<SaveStatus>('saved');
  // The graph as it is in the database right now (as text, to compare quickly).
  const lastSaved = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const query = useQuery({
    queryKey: ['workflow', workflowId],
    queryFn: async () => {
      const response = await apiFetch<WorkflowResponse>(
        `/workflows/${workflowId}`,
      );
      const { nodes, edges } = deserializeGraph(response.workflow.draftGraph);
      loadGraph(nodes, edges);
      lastSaved.current = JSON.stringify(serializeGraph(nodes, edges));
      return response;
    },
    // The store is the source of truth while editing. Never reload from the
    // server on focus, and drop the cache on leave so every visit loads fresh.
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  const isReady = query.isSuccess;
  const unauthorized =
    query.error instanceof ApiError && query.error.status === 401;

  useEffect(() => {
    if (unauthorized) router.replace('/login');
  }, [unauthorized, router]);

  useEffect(() => {
    if (!isReady) return;

    function schedule(delay: number) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    }

    async function flush() {
      const { nodes, edges } = useGraphStore.getState();
      const graph = serializeGraph(nodes, edges);
      const snapshot = JSON.stringify(graph);

      if (snapshot === lastSaved.current) {
        setStatus('saved');
        return;
      }

      setStatus('saving');
      try {
        await apiFetch<SaveDraftResponse>(`/workflows/${workflowId}/draft`, {
          method: 'PATCH',
          body: JSON.stringify({ graph }),
        });
        lastSaved.current = snapshot;
        // The user may have kept editing while we were saving.
        setStatus(currentSnapshot() === snapshot ? 'saved' : 'unsaved');
      } catch {
        setStatus('error');
        schedule(RETRY_DELAY_MS);
      }
    }

    const unsubscribe = useGraphStore.subscribe(() => {
      // Selecting a node changes the store but not the graph. Ignore that.
      if (currentSnapshot() === lastSaved.current) return;
      setStatus('unsaved');
      schedule(SAVE_DELAY_MS);
    });

    return () => {
      unsubscribe();
      clearTimeout(timer.current);
      // Leaving the page: save what is still waiting.
      if (currentSnapshot() !== lastSaved.current) void flush();
    };
  }, [isReady, workflowId]);

  if (query.isPending) {
    return <CenteredMessage text="Loading workflow..." />;
  }

  if (query.isError) {
    const notFound =
      query.error instanceof ApiError && query.error.status === 404;
    const text = unauthorized
      ? 'Redirecting to login...'
      : notFound
        ? 'Workflow not found.'
        : query.error.message;
    return <CenteredMessage text={text} />;
  }

  return (
    <div className="relative flex h-screen w-full">
      <NodePalette />
      <div className="min-w-0 flex-1">
        <WorkflowCanvas />
      </div>
      <NodeConfigPanel />
      <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-md border bg-background px-3 py-1 text-xs shadow-sm">
        {query.data.workflow.name} · {statusText[status]}
      </div>
    </div>
  );
}