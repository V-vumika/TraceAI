import { types } from 'node:util';
import type { ExecContext } from './types';

export type ExpressionContext = Pick<ExecContext, 'input' | 'trigger'> & {
  nodes?: Readonly<Record<string, { readonly output: unknown }>>;
};

export class ExpressionResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpressionResolutionError';
  }
}

const blockedKeys = new Set(['__proto__', 'constructor', 'prototype']);

function readProperty(value: unknown, key: string): unknown {
  if (blockedKeys.has(key)) {
    throw new ExpressionResolutionError('Unsafe property in expression.');
  }
  if (value === null || typeof value !== 'object') return undefined;
  if (types.isProxy(value)) {
    throw new ExpressionResolutionError('Proxy values are not supported.');
  }

  const property = Object.getOwnPropertyDescriptor(value, key);
  if (property && (!Object.hasOwn(property, 'value') || typeof property.value === 'function')) {
    throw new ExpressionResolutionError('Expression paths must refer to data properties.');
  }
  return property?.value;
}

const functionArity = {
  json: 1,
  upper: 1,
  lower: 1,
  length: 1,
  default: 2,
  now: 0,
} as const;

type FunctionName = keyof typeof functionArity;
type Expression =
  | { kind: 'path'; keys: string[] }
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'call'; name: FunctionName; args: Expression[] };

function isFunctionName(name: string): name is FunctionName {
  return Object.hasOwn(functionArity, name);
}

function parseExpression(source: string): Expression {
  let cursor = 0;
  const word = /[A-Za-z_$][\w$]*/y;
  const segment =
    /\.([A-Za-z_$][\w$]*)|\[(0|[1-9]\d*|"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*")\]/y;
  const literal =
    /"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*"|'(?:[^'\\\x00-\x1f]|\\(?:['"\\/bfnrt]|u[\da-fA-F]{4}))*'|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const whitespace = /\s*/y;

  function take(pattern: RegExp): RegExpExecArray | null {
    pattern.lastIndex = cursor;
    const match = pattern.exec(source);
    if (match) cursor = pattern.lastIndex;
    return match;
  }

  function consume(character: string): boolean {
    take(whitespace);
    if (source[cursor] !== character) return false;
    cursor++;
    return true;
  }

  function parse(depth: number): Expression {
    if (depth > 64) throw new ExpressionResolutionError('Expression is nested too deeply.');
    take(whitespace);

    const token = take(literal)?.[0];
    if (token !== undefined) {
      const json = token.startsWith("'")
        ? '"' +
          token
            .slice(1, -1)
            .replace(/\\'|\\.|"/g, (part) => (part === "\\'" ? "'" : part === '"' ? '\\"' : part)) +
          '"'
        : token;
      const value = JSON.parse(json) as string | number;
      if (typeof value === 'number' && !Number.isFinite(value)) {
        throw new ExpressionResolutionError('Expression number must be finite.');
      }
      return { kind: 'literal', value };
    }

    const name = take(word)?.[0];
    if (name === undefined) throw new ExpressionResolutionError('Invalid expression.');
    const afterName = cursor;

    if (consume('(')) {
      if (!isFunctionName(name)) {
        throw new ExpressionResolutionError('Function is not allowed in expressions.');
      }

      const args: Expression[] = [];
      if (!consume(')')) {
        do {
          if (args.length === functionArity[name]) {
            throw new ExpressionResolutionError('Incorrect number of function arguments.');
          }
          args.push(parse(depth + 1));
        } while (consume(','));
        if (!consume(')')) throw new ExpressionResolutionError('Invalid function arguments.');
      }
      if (args.length !== functionArity[name]) {
        throw new ExpressionResolutionError('Incorrect number of function arguments.');
      }
      return { kind: 'call', name, args };
    }

    if (name === 'true' || name === 'false' || name === 'null') {
      return { kind: 'literal', value: name === 'null' ? null : name === 'true' };
    }
    if (name !== 'input' && name !== 'trigger' && name !== 'nodes') {
      throw new ExpressionResolutionError('Invalid expression path.');
    }

    cursor = afterName;
    const keys = [name] as string[];
    for (let match = take(segment); match; match = take(segment)) {
      const [, property, bracket] = match;
      const key = bracket?.startsWith('"')
        ? (JSON.parse(bracket) as string)
        : (bracket ?? property);
      if (key === undefined || blockedKeys.has(key)) {
        throw new ExpressionResolutionError('Unsafe property in expression.');
      }
      keys.push(key);
    }
    return { kind: 'path', keys };
  }

  const expression = parse(0);
  take(whitespace);
  if (cursor !== source.length) throw new ExpressionResolutionError('Invalid expression.');
  return expression;
}

function stringifyData(value: unknown, ancestors = new Set<object>()): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return JSON.stringify(value);
  }
  if (typeof value !== 'object' || types.isProxy(value)) {
    throw new ExpressionResolutionError('json() requires JSON data.');
  }
  if (ancestors.has(value) || ancestors.size >= 64) {
    throw new ExpressionResolutionError('json() data is circular or nested too deeply.');
  }
  ancestors.add(value);
  try {
    function serializeProperty(key: string): string {
      const property = Object.getOwnPropertyDescriptor(value, key);
      if (!property || !Object.hasOwn(property, 'value')) {
        throw new ExpressionResolutionError('json() requires data properties.');
      }
      return stringifyData(property.value, ancestors);
    }

    if (Array.isArray(value)) {
      const items: string[] = [];
      for (let index = 0; index < value.length; index++) {
        const key = String(index);
        items.push(Object.hasOwn(value, key) ? serializeProperty(key) : 'null');
      }
      return '[' + items.join(',') + ']';
    }

    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== null && prototype !== Object.prototype) {
      throw new ExpressionResolutionError('json() requires JSON data.');
    }
    return (
      '{' +
      Object.keys(value)
        .map((key) => JSON.stringify(key) + ':' + serializeProperty(key))
        .join(',') +
      '}'
    );
  } finally {
    ancestors.delete(value);
  }
}

function requireValue(value: unknown): unknown {
  if (value === undefined) throw new ExpressionResolutionError('Expression path has no value.');
  return value;
}

function evaluate(expression: Expression, context: ExpressionContext): unknown {
  if (expression.kind === 'literal') return expression.value;
  if (expression.kind === 'path') return expression.keys.reduce<unknown>(readProperty, context);

  const [first, fallback] = expression.args;
  if (expression.name === 'now') return new Date().toISOString();
  if (!first) throw new ExpressionResolutionError('Incorrect number of function arguments.');

  const value = evaluate(first, context);
  if (expression.name === 'default') {
    if (value !== undefined && value !== null && value !== '') return value;
    if (!fallback) throw new ExpressionResolutionError('Incorrect number of function arguments.');
    return evaluate(fallback, context);
  }

  requireValue(value);
  if (expression.name === 'json') return stringifyData(value);
  if (expression.name === 'length' && !types.isProxy(value) && Array.isArray(value)) {
    return value.length;
  }
  if (typeof value !== 'string') {
    throw new ExpressionResolutionError('Function argument has an invalid type.');
  }
  if (expression.name === 'length') return value.length;
  return expression.name === 'upper' ? value.toUpperCase() : value.toLowerCase();
}

/** A standalone expression preserves its value type. Text only interpolates scalars. */
export function resolveTemplate(template: string, context: ExpressionContext): unknown {
  let text = '';
  let cursor = 0;

  for (const match of template.matchAll(
    /\{\{((?:[^{}"']|"(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*')*)\}\}|\{\{/g,
  )) {
    const expression = match[1];
    if (expression === undefined) {
      throw new ExpressionResolutionError('Unmatched expression delimiter.');
    }

    const start = match.index;
    const end = start + match[0].length;
    const value = requireValue(evaluate(parseExpression(expression), context));
    if (start === 0 && end === template.length) return value;

    if (
      value !== null &&
      typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean'
    ) {
      throw new ExpressionResolutionError('Only scalar values can be interpolated into text.');
    }
    text += template.slice(cursor, start) + String(value);
    cursor = end;
  }

  return text + template.slice(cursor);
}
