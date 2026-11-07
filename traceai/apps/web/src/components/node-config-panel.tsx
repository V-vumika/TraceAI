'use client';

import { useState } from 'react';
import type { Node } from '@xyflow/react';
import { getNodeDefinition } from '@traceai/nodes';
import { CodeEditor } from '@/components/code-editor';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getConfigFields, type ConfigField } from '@/lib/config-fields';
import { nodeCatalog } from '@/lib/node-catalog';
import { useGraphStore } from '@/stores/graph-store';

const controlClass =
  'w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring';

type Values = Record<string, string>;
type Errors = Record<string, string>;

// Turn the text the user typed into the shape the Zod schema expects.
function toInput(fields: ConfigField[], values: Values) {
  const input: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.name] ?? '';
    if (field.kind === 'number') {
      input[field.name] = raw === '' ? undefined : Number(raw);
    } else {
      input[field.name] = raw;
    }
  }
  return input;
}

function NodeConfigForm({ node }: { node: Node }) {
  const updateNodeConfig = useGraphStore((state) => state.updateNodeConfig);

  const nodeType = String(node.data.nodeType ?? '');
  const fields = getConfigFields(nodeType);
  const definition = getNodeDefinition(nodeType);
  const saved = (node.data.config ?? {}) as Record<string, unknown>;

  const [values, setValues] = useState<Values>(() => {
    const initial: Values = {};
    for (const field of fields) {
      const value = saved[field.name] ?? field.defaultValue ?? '';
      initial[field.name] = String(value);
    }
    return initial;
  });
  const [errors, setErrors] = useState<Errors>({});

  function handleChange(name: string, value: string) {
    const next = { ...values, [name]: value };
    setValues(next);

    if (!definition) return;

    const result = definition.configSchema.safeParse(toInput(fields, next));

    if (result.success) {
      setErrors({});
      updateNodeConfig(node.id, result.data as Record<string, unknown>);
      return;
    }

    const nextErrors: Errors = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? '');
      if (key && !nextErrors[key]) nextErrors[key] = issue.message;
    }
    setErrors(nextErrors);
  }

  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">This node has no settings.</p>
    );
  }

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        const id = `config-${field.name}`;
        const value = values[field.name] ?? '';

        return (
          <div key={field.name} className="space-y-1.5">
            <Label htmlFor={id}>
              {field.label}
              {field.required && <span className="text-destructive"> *</span>}
            </Label>

            {field.description && (
              <p className="text-xs text-muted-foreground">
                {field.description}
              </p>
            )}

            {field.kind === 'select' && (
              <select
                id={id}
                className={controlClass}
                value={value}
                onChange={(event) =>
                  handleChange(field.name, event.target.value)
                }
              >
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}

            {field.kind === 'textarea' && (
              <textarea
                id={id}
                className={`${controlClass} min-h-28`}
                value={value}
                onChange={(event) =>
                  handleChange(field.name, event.target.value)
                }
              />
            )}

            {field.kind === 'code' && (
              <CodeEditor
                value={value}
                language={field.language ?? 'javascript'}
                onChange={(next) => handleChange(field.name, next)}
              />
            )}

            {field.kind === 'number' && (
              <Input
                id={id}
                type="number"
                min={field.min}
                max={field.max}
                value={value}
                onChange={(event) =>
                  handleChange(field.name, event.target.value)
                }
              />
            )}

            {field.kind === 'text' && (
              <Input
                id={id}
                value={value}
                onChange={(event) =>
                  handleChange(field.name, event.target.value)
                }
              />
            )}

            {errors[field.name] && (
              <p className="text-xs text-destructive">{errors[field.name]}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

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

        <NodeConfigForm key={selectedNode.id} node={selectedNode} />

        <p className="text-xs text-muted-foreground">ID: {selectedNode.id}</p>
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