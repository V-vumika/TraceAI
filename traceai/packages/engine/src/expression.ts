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

function resolvePath(expression: string, context: ExpressionContext): unknown {
  const path = expression.trim();
  const root = /^(input|trigger|nodes)(?=\.|\[|$)/.exec(path)?.[0];
  if (!root) throw new ExpressionResolutionError('Invalid expression path.');

  const segment =
    /\.([A-Za-z_$][\w$]*)|\[(0|[1-9]\d*|"(?:[^"\\{}\x00-\x1f]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*")\]/y;
  const keys = [root];
  segment.lastIndex = root.length;
  while (segment.lastIndex < path.length) {
    const match = segment.exec(path);
    if (!match) throw new ExpressionResolutionError('Invalid expression path.');
    const bracket = match[2];
    if (bracket !== undefined) {
      const key = bracket.startsWith('"') ? (JSON.parse(bracket) as string) : bracket;
      keys.push(key);
    } else if (match[1] !== undefined) {
      keys.push(match[1]);
    }
  }

  const value = keys.reduce<unknown>(readProperty, context);
  if (value === undefined) {
    throw new ExpressionResolutionError('Expression path has no value.');
  }
  return value;
}

/** A standalone expression preserves its value type. Text only interpolates scalars. */
export function resolveTemplate(template: string, context: ExpressionContext): unknown {
  let text = '';
  let cursor = 0;

  for (const match of template.matchAll(/\{\{([^{}]*)\}\}|\{\{/g)) {
    const expression = match[1];
    if (expression === undefined) {
      throw new ExpressionResolutionError('Unmatched expression delimiter.');
    }

    const start = match.index;
    const end = start + match[0].length;
    const value = resolvePath(expression, context);
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
