import { z } from 'zod';
import type { NodeDefinition } from './types';

// Note: url, expression and prompt fields are plain strings (not z.url())
// because they will later accept {{ }} template expressions (Task 36).

const manualTriggerConfig = z.object({});

const llmConfig = z.object({
  provider: z
    .enum(['mock', 'openai', 'anthropic'])
    .default('mock')
    .describe('Which model provider to use'),
  model: z.string().min(1).default('mock-1').describe('Model name'),
  prompt: z.string().min(1).describe('Prompt sent to the model'),
  temperature: z
    .number()
    .min(0)
    .max(2)
    .default(0.7)
    .describe('Higher means more random'),
  maxTokens: z
    .number()
    .int()
    .min(1)
    .max(8192)
    .default(512)
    .describe('Maximum length of the answer'),
});

const conditionConfig = z.object({
  expression: z
    .string()
    .min(1)
    .describe('Expression that decides true or false'),
});

const httpConfig = z.object({
  method: z
    .enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
    .default('GET')
    .describe('HTTP method'),
  url: z.string().min(1).describe('Address to call'),
  headers: z.string().default('{}').describe('Request headers as JSON'),
  body: z.string().default('').describe('Request body'),
});

const javascriptConfig = z.object({
  code: z.string().min(1).default('return input;').describe('Code to run'),
});

const mergeConfig = z.object({
  mode: z
    .enum(['all', 'any'])
    .default('all')
    .describe('Wait for all branches, or continue on the first one'),
});

const delayConfig = z.object({
  seconds: z
    .number()
    .int()
    .min(0)
    .max(86400)
    .default(5)
    .describe('How long to wait, in seconds'),
});

export const nodeDefinitions: NodeDefinition[] = [
  {
    type: 'manual-trigger',
    label: 'Manual Trigger',
    description: 'Start a run by hand',
    category: 'Triggers',
    configSchema: manualTriggerConfig,
  },
  {
    type: 'llm',
    label: 'LLM',
    description: 'Send a prompt to a language model',
    category: 'AI',
    configSchema: llmConfig,
  },
  {
    type: 'condition',
    label: 'Condition',
    description: 'Branch on true or false',
    category: 'Logic',
    configSchema: conditionConfig,
  },
  {
    type: 'merge',
    label: 'Merge',
    description: 'Join branches back together',
    category: 'Logic',
    configSchema: mergeConfig,
  },
  {
    type: 'delay',
    label: 'Delay',
    description: 'Wait before continuing',
    category: 'Logic',
    configSchema: delayConfig,
  },
  {
    type: 'http',
    label: 'HTTP Request',
    description: 'Call an external API',
    category: 'Actions',
    configSchema: httpConfig,
  },
  {
    type: 'javascript',
    label: 'JavaScript',
    description: 'Run a small piece of code',
    category: 'Actions',
    configSchema: javascriptConfig,
  },
];

export function getNodeDefinition(type: string) {
  return nodeDefinitions.find((definition) => definition.type === type);
}