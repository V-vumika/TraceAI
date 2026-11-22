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
    '{{ upper(input.name) }}',
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
