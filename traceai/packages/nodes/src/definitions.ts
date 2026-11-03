import { z } from 'zod';
import type { NodeDefinition } from './types';

// Placeholder. Real config schemas for each node are added in Task 33.
const emptyConfig = z.object({});

export const nodeDefinitions: NodeDefinition[] = [
  {
    type: 'manual-trigger',
    label: 'Manual Trigger',
    description: 'Start a run by hand',
    category: 'Triggers',
    configSchema: emptyConfig,
  },
  {
    type: 'llm',
    label: 'LLM',
    description: 'Send a prompt to a language model',
    category: 'AI',
    configSchema: emptyConfig,
  },
  {
    type: 'condition',
    label: 'Condition',
    description: 'Branch on true or false',
    category: 'Logic',
    configSchema: emptyConfig,
  },
  {
    type: 'merge',
    label: 'Merge',
    description: 'Join branches back together',
    category: 'Logic',
    configSchema: emptyConfig,
  },
  {
    type: 'delay',
    label: 'Delay',
    description: 'Wait before continuing',
    category: 'Logic',
    configSchema: emptyConfig,
  },
  {
    type: 'http',
    label: 'HTTP Request',
    description: 'Call an external API',
    category: 'Actions',
    configSchema: emptyConfig,
  },
  {
    type: 'javascript',
    label: 'JavaScript',
    description: 'Run a small piece of code',
    category: 'Actions',
    configSchema: emptyConfig,
  },
];

export function getNodeDefinition(type: string) {
  return nodeDefinitions.find((definition) => definition.type === type);
}