import { apiFetch, type WorkflowResponse } from '@/lib/api';

export type WorkspaceSummary = {
  id: string;
  name: string;
  role: string;
};

export type WorkflowSummary = {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
};

export function fetchWorkspaces() {
  return apiFetch<{ workspaces: WorkspaceSummary[] }>('/workspaces');
}

export function createWorkspace(name: string) {
  return apiFetch<{ workspace: { id: string; name: string } }>('/workspaces', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function fetchWorkflows(workspaceId: string) {
  return apiFetch<{ workflows: WorkflowSummary[] }>(
    `/workspaces/${workspaceId}/workflows`,
  );
}

export function createWorkflow(workspaceId: string, name: string) {
  return apiFetch<WorkflowResponse>(`/workspaces/${workspaceId}/workflows`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}