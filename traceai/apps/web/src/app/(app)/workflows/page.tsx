import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type Workflow = {
  id: string;
  name: string;
  status: 'draft' | 'published';
  nodes: number;
  updatedAt: string;
};

// TODO (Task 18): replace with data from GET /workflows via TanStack Query.
const workflows: Workflow[] = [
  {
    id: 'wf_1',
    name: 'Summarise support emails',
    status: 'published',
    nodes: 5,
    updatedAt: '2 hours ago',
  },
  {
    id: 'wf_2',
    name: 'Lead enrichment',
    status: 'draft',
    nodes: 3,
    updatedAt: 'Yesterday',
  },
  {
    id: 'wf_3',
    name: 'Daily report to Slack',
    status: 'draft',
    nodes: 7,
    updatedAt: '3 days ago',
  },
];

export default function WorkflowsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Build, run and trace your automations.
          </p>
        </div>
        <Button>New workflow</Button>
      </div>

      {workflows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No workflows yet</CardTitle>
            <CardDescription>
              Create your first workflow to get started.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {workflows.map((workflow) => (
            <Card key={workflow.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{workflow.name}</CardTitle>
                  <span
                    className={
                      workflow.status === 'published'
                        ? 'rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground'
                        : 'rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'
                    }
                  >
                    {workflow.status}
                  </span>
                </div>
                <CardDescription>
                  {workflow.nodes} nodes · Updated {workflow.updatedAt}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}