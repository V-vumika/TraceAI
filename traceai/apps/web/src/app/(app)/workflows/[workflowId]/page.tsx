import { WorkflowEditor } from '@/components/workflow-editor';

export default async function WorkflowPage({
  params,
}: {
  params: Promise<{ workflowId: string }>;
}) {
  const { workflowId } = await params;

  return <WorkflowEditor key={workflowId} workflowId={workflowId} />;
}