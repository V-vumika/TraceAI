import { z } from 'zod';
import { commonSettingsSchema, getNodeDefinition } from '@traceai/nodes';

export type CodeLanguage = 'javascript' | 'json';

export type ConfigField = {
  name: string;
  label: string;
  description: string;
  kind: 'text' | 'expression' | 'number' | 'select' | 'code' | 'checkbox';
  multiline: boolean;
  language: CodeLanguage | undefined;
  options: string[];
  defaultValue: string | number | boolean | undefined;
  min: number | undefined;
  max: number | undefined;
  required: boolean;
};

type JsonProperty = {
  type?: string;
  enum?: string[];
  default?: string | number | boolean;
  description?: string;
  minimum?: number;
  maximum?: number;
};

type JsonObjectSchema = {
  properties?: Record<string, JsonProperty>;
};

// Fields where the user can write {{ }} expressions.
const EXPRESSION_FIELDS = new Set(['prompt', 'url', 'body', 'expression']);

// Of those, the ones that need more than one line.
const MULTILINE_FIELDS = new Set(['prompt', 'body']);

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
  if (property.type === 'boolean') return 'checkbox';
  if (property.type === 'number' || property.type === 'integer') return 'number';
  if (CODE_LANGUAGES.has(name)) return 'code';
  if (EXPRESSION_FIELDS.has(name)) return 'expression';
  return 'text';
}

// Works for any Zod object schema: node config or common settings.
export function getSchemaFields(schema: z.ZodType): ConfigField[] {
  const jsonSchema = z.toJSONSchema(schema) as unknown as JsonObjectSchema;
  const properties = jsonSchema.properties ?? {};

  return Object.entries(properties).map(([name, property]) => ({
    name,
    label: toLabel(name),
    description: property.description ?? '',
    kind: getKind(name, property),
    multiline: MULTILINE_FIELDS.has(name),
    language: CODE_LANGUAGES.get(name),
    options: property.enum ?? [],
    defaultValue: property.default,
    min: property.minimum,
    max: property.maximum,
    required: property.default === undefined,
  }));
}

export function getConfigFields(nodeType: string): ConfigField[] {
  const definition = getNodeDefinition(nodeType);
  return definition ? getSchemaFields(definition.configSchema) : [];
}

export function getCommonSettingFields(): ConfigField[] {
  return getSchemaFields(commonSettingsSchema);
}