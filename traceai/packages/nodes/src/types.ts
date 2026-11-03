import type { ZodType } from 'zod';

export type NodeCategory = 'Triggers' | 'AI' | 'Logic' | 'Actions';

export type NodeDefinition = {
  type: string;
  label: string;
  description: string;
  category: NodeCategory;
  configSchema: ZodType;
};