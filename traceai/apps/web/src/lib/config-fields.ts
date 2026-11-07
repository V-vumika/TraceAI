import { z } from 'zod';
import { getNodeDefinition } from '@traceai/nodes';

export type CodeLanguage = 'javascript' | 'json';

export type ConfigField = {
  name: string;
  label: string;
  description: string;
  kind: 'text' | 'textarea' | 'number' | 'select' | 'code';
  language: CodeLanguage | undefined;
  options: string[];
  defaultValue: string | number | undefined;
  min: number | undefined;
  max: number | undefined;
  required: boolean;
};

type JsonProperty = {
  type?: string;
  enum?: string[];
  default?: string | number;
  description?: string;
  minimum?: number;
  maximum?: number;
};

type JsonObjectSchema = {
  properties?: Record<string, JsonProperty>;
};

const TEXTAREA_FIELDS = new Set(['prompt', 'body']);

const CODE_LANGUAGES = new Map<string, CodeLanguage>([
  ['code', 'javascript'],
  ['headers', 'json'],
]);

// "maxTokens" -> "Max Tokens"
function toLabel(name: string) {
  const spaced = name.replace(/([A-Z])/g, ' $1');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function getKind(name: string, property: JsonProperty): ConfigField['kind'] {
  if (property.enum) return 'select';
  if (property.type === 'number' || property.type === 'integer') return 'number';
  if (CODE_LANGUAGES.has(name)) return 'code';
  if (TEXTAREA_FIELDS.has(name)) return 'textarea';
  return 'text';
}

export function getConfigFields(nodeType: string): ConfigField[] {
  const definition = getNodeDefinition(nodeType);
  if (!definition) return [];

  const jsonSchema = z.toJSONSchema(
    definition.configSchema,
  ) as unknown as JsonObjectSchema;

  const properties = jsonSchema.properties ?? {};

  return Object.entries(properties).map(([name, property]) => ({
    name,
    label: toLabel(name),
    description: property.description ?? '',
    kind: getKind(name, property),
    language: CODE_LANGUAGES.get(name),
    options: property.enum ?? [],
    defaultValue: property.default,
    min: property.minimum,
    max: property.maximum,
    required: property.default === undefined,
  }));
}