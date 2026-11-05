import { NodeConfigPanel } from '@/components/node-config-panel';
import { NodePalette } from '@/components/node-palette';
import { WorkflowCanvas } from '@/components/workflow-canvas';

export default function DemoCanvasPage() {
  return (
    <div className="flex h-screen w-full">
      <NodePalette />
      <div className="min-w-0 flex-1">
        <WorkflowCanvas />
      </div>
      <NodeConfigPanel />
    </div>
  );
}