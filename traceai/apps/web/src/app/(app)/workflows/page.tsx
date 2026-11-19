'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ApiError } from '@/lib/api';
import {
  createWorkflow,
  createWorkspace,
  fetchWorkflows,
  fetchWorkspaces,
  type WorkspaceSummary,
} from '@/lib/workflows-api';

function Message({ text }: { text: string }) {
  return (
    <main className="mx-auto w-full max-w-4xl p-6 text-sm text-muted-foreground">
      {text}
    </main>
  );
}

export default function WorkflowsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // A new user has no workspace yet, so the first visit creates one.
  const workspaceQuery = useQuery({
    queryKey: ['workspaces'],
    queryFn: async (): Promise<WorkspaceSummary[]> => {
      const { workspaces } = await fetchWorkspaces();
      if (workspaces.length > 0) return workspaces;

      const created = await createWorkspace('My Workspace');
      return [
        {
          id: created.workspace.id,
          name: created.workspace.name,
          role: 'owner',
        },
      ];
    },
    staleTime: Infinity,
    retry: false,
  });

  const workspace = workspaceQuery.data?.[0];
  const workspaceId = workspace?.id ?? '';

  const workflowsQuery = useQuery({
    queryKey: ['workflows', workspaceId],
    queryFn: () => fetchWorkflows(workspaceId),
    enabled: workspaceId !== '',
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: () => createWorkflow(workspaceId, 'Untitled workflow'),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['workflows'] });
      router.push(`/workflows/${data.workflow.id}`);
    },
  });

  const unauthorized = [workspaceQuery.error, workflowsQuery.error].some(
    (error) => error instanceof ApiError && error.status === 401,
  );

  useEffect(() => {
    if (unauthorized) router.replace('/login');
  }, [unauthorized, router]);

  if (unauthorized) return <Message text="Redirecting to login..." />;

  if (workspaceQuery.isError) {
    return <Message text={workspaceQuery.error.message} />;
  }

  if (workspaceQuery.isPending || workflowsQuery.isPending) {
    return <Message text="Loading workflows..." />;
  }

  if (workflowsQuery.isError) {
    return <Message text={workflowsQuery.error.message} />;
  }

  const workflows = workflowsQuery.data.workflows;

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            {workspace?.name} · build, run and trace your automations.
          </p>
        </div>
        <Button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? 'Creating...' : 'New workflow'}
        </Button>
      </div>

      {createMutation.isError && (
        <p className="text-sm text-destructive">
          {createMutation.error.message}
        </p>
      )}

      {workflows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No workflows yet</CardTitle>
            <CardDescription>
              Click New workflow to build your first one.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {workflows.map((workflow) => (
            <Link key={workflow.id} href={`/workflows/${workflow.id}`}>
              <Card className="transition-colors hover:bg-muted">
                <CardHeader>
                  <CardTitle className="text-base">{workflow.name}</CardTitle>
                  <CardDescription>
                    Updated {new Date(workflow.updatedAt).toLocaleString()}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}