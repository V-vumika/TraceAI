import { describe, expect, it, vi } from 'vitest';
import { ExpressionResolutionError, resolveTemplate } from './index';

const context = {
  input: { name: 'Ada', active: false, count: 0, items: [{ name: 'first' }] },
  trigger: { body: { id: 42, optional: null } },
  nodes: { 'classify-1': { output: { category: 'billing' } } },
};

describe('resolveTemplate', () => {
  it('preserves literal text and interpolates multiple scalar values', () => {
    expect(resolveTemplate('No expressions {here}.', context)).toBe('No expressions {here}.');
    expect(resolveTemplate('{{ input.name }}: {{ input.active }}/{{ input.count }}', context)).toBe(
      'Ada: false/0',
    );
  });

  it('preserves closing braces in JSON templates', () => {
    expect(resolveTemplate('{"nested":{"count":{{ input.count }}}}', context)).toBe(
      '{"nested":{"count":0}}',
    );
    expect(resolveTemplate('{"nested":{}}', context)).toBe('{"nested":{}}');
  });

  it('preserves value types for standalone expressions', () => {
    expect(resolveTemplate('{{ trigger.body.id }}', context)).toBe(42);
    expect(resolveTemplate('{{ trigger.body.optional }}', context)).toBeNull();
    expect(resolveTemplate('{{ input.items }}', context)).toEqual([{ name: 'first' }]);
  });

  it('resolves nested arrays and upstream node outputs', () => {
    expect(resolveTemplate('{{ input.items[0].name }}', context)).toBe('first');
    expect(resolveTemplate('{{ nodes["classify-1"].output.category }}', context)).toBe('billing');
  });

  it.each(['input.absent', 'input.items[1].name', 'trigger.body.optional.id'])(
    'fails safely for missing path %s',
    (path) => {
      expect(() => resolveTemplate('{{ ' + path + ' }}', context)).toThrow(
        'Expression path has no value.',
      );
    },
  );

  it.each(['{{ }}', '{{ input', '{{ {{ input }} }}', '{{ input..name }}', '{{ input[ ]] }}'])(
    'rejects malformed template %s',
    (template) => {
      expect(() => resolveTemplate(template, context)).toThrow(ExpressionResolutionError);
    },
  );

  it.each([
    '{{ eval(input.name) }}',
    '{{ input.name.toUpperCase() }}',
    '{{ constructor() }}',
    '{{ upper.constructor(input.name) }}',
    '{{ input.name + "!" }}',
    '{{ globalThis.process }}',
    '{{ input["constructor"] }}',
    '{{ input["\u005f_proto__"] }}',
    '{{ input.prototype }}',
  ])('rejects unsafe or unsupported expression %s', (template) => {
    expect(() => resolveTemplate(template, context)).toThrow(ExpressionResolutionError);
  });

  it('leaves inherited properties and getters untouched', () => {
    const getter = vi.fn(() => 'secret');
    const input = Object.create({ inherited: 'secret' });
    Object.defineProperty(input, 'computed', { get: getter });

    expect(() => resolveTemplate('{{ input.inherited }}', { ...context, input })).toThrow(
      'Expression path has no value.',
    );
    expect(() => resolveTemplate('{{ input.computed }}', { ...context, input })).toThrow(
      ExpressionResolutionError,
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it('does not invoke proxy traps or coerce objects while interpolating', () => {
    const trap = vi.fn();
    const toString = vi.fn();
    const input = {
      proxy: new Proxy({}, { getOwnPropertyDescriptor: trap }),
      object: { toString },
    };
    expect(() => resolveTemplate('{{ input.proxy.value }}', { ...context, input })).toThrow(
      ExpressionResolutionError,
    );
    expect(() => resolveTemplate('Value: {{ input.object }}', { ...context, input })).toThrow(
      ExpressionResolutionError,
    );
    expect(trap).not.toHaveBeenCalled();
    expect(toString).not.toHaveBeenCalled();
  });
});

describe('whitelisted expression functions', () => {
  it.each([
    ['{{ upper(input.name) }}', 'ADA'],
    ['{{ lower("UPPER") }}', 'upper'],
    ['{{ length(input.name) }}', 3],
    ['{{ length(input.items) }}', 1],
    ['{{ json(input.items) }}', '[{"name":"first"}]'],
    ['{{ json(trigger.body.optional) }}', 'null'],
    ['{{ default(input.missing, 42) }}', 42],
    ["{{ default(trigger.body.optional, 'missing') }}", 'missing'],
    ['{{ default("", "missing") }}', 'missing'],
    ['{{ default(input.active, true) }}', false],
    ['{{ default(input.count, 9) }}', 0],
    ['{{ default(input.name, input.missing) }}', 'Ada'],
    ['Value: {{ upper(default(input.missing, "unknown, (user)")) }}', 'Value: UNKNOWN, (USER)'],
    ['{{ upper(nodes["classify-1"].output.category) }}', 'BILLING'],
    ['{{ upper("literal }} text") }}', 'LITERAL }} TEXT'],
    ["{{ json('a\\'b\"c') }}", '"a\'b\\"c"'],
  ])('resolves %s', (template, expected) => {
    expect(resolveTemplate(template, context)).toBe(expected);
  });

  it('returns the current time in ISO format', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-22T12:00:00.000Z'));
      expect(resolveTemplate('{{ now() }}', context)).toBe('2026-11-22T12:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    '{{ now(1) }}',
    '{{ upper() }}',
    '{{ default(input.name) }}',
    '{{ upper(input.name,) }}',
    '{{ lower(input.count) }}',
    '{{ length(trigger.body) }}',
    '{{ lower(input.missing) }}',
    '{{ default(input.name, constructor()) }}',
    '{{ default(input.name, input.prototype) }}',
    '{{ json(input) + "extra" }}',
  ])('rejects invalid call %s', (template) => {
    expect(() => resolveTemplate(template, context)).toThrow(ExpressionResolutionError);
  });

  it('does not run getters, toJSON methods, or proxy traps while serializing', () => {
    const getter = vi.fn();
    const toJSON = vi.fn();
    const ownKeys = vi.fn();
    const withGetter = Object.defineProperty({}, 'name', { enumerable: true, get: getter });

    for (const input of [withGetter, { toJSON }, new Proxy({}, { ownKeys })]) {
      expect(() => resolveTemplate('{{ json(input) }}', { ...context, input })).toThrow(
        ExpressionResolutionError,
      );
    }
    expect(getter).not.toHaveBeenCalled();
    expect(toJSON).not.toHaveBeenCalled();
    expect(ownKeys).not.toHaveBeenCalled();
  });

  it('rejects circular JSON data', () => {
    const input: Record<string, unknown> = {};
    input.self = input;
    expect(() => resolveTemplate('{{ json(input) }}', { ...context, input })).toThrow(
      ExpressionResolutionError,
    );
  });
});
