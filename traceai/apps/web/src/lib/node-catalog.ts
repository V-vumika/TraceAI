export type NodeCategory = 'Triggers' | 'AI' | 'Logic' | 'Actions';

export type NodeCatalogItem = {
  type: string;
  label: string;
  description: string;
  category: NodeCategory;
};

export const nodeCategories: NodeCategory[] = [
  'Triggers',
  'AI',
  'Logic',
  'Actions',
];

export const nodeCatalog: NodeCatalogItem[] = [
  {
    type: 'manual-trigger',
    label: 'Manual Trigger',
    description: 'Start a run by hand',
    category: 'Triggers',
  },
  {
    type: 'llm',
    label: 'LLM',
    description: 'Send a prompt to a language model',
    category: 'AI',
  },
  {
    type: 'condition',
    label: 'Condition',
    description: 'Branch on true or false',
    category: 'Logic',
  },
  {
    type: 'merge',
    label: 'Merge',
    description: 'Join branches back together',
    category: 'Logic',
  },
  {
    type: 'delay',
    label: 'Delay',
    description: 'Wait before continuing',
    category: 'Logic',
  },
  {
    type: 'http',
    label: 'HTTP Request',
    description: 'Call an external API',
    category: 'Actions',
  },
  {
    type: 'javascript',
    label: 'JavaScript',
    description: 'Run a small piece of code',
    category: 'Actions',
  },
];

export const NODE_DRAG_TYPE = 'application/traceai-node';