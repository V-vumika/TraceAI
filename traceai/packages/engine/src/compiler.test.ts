import { describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode } from '@traceai/nodes';
import { compileGraph } from './index';

function node(id: string, nodeType: string, config: Record<string, unknown> = {}): GraphNode {
  return { id, data: { nodeType, config } };
}

function edge(source: string, target: string): GraphEdge {
  return { id: `${source}-${target}`, source, target };
}

describe('compileGraph', () => {
  it('orders a linear graph and indexes dependencies in both directions', () => {
    const graph = {
      nodes: [
        node('last', 'delay'),
        node('first', 'manual-trigger'),
        node('middle', 'llm', { prompt: 'Summarize {{ input }}' }),
      ],
      edges: [edge('middle', 'last'), edge('first', 'middle')],
    };

    const compiled = compileGraph(graph);

    expect(compiled.topologicalOrder).toEqual(['first', 'middle', 'last']);
    expect(compiled.parents).toEqual(
      new Map([
        ['first', []],
        ['middle', ['first']],
        ['last', ['middle']],
      ]),
    );
    expect(compiled.children).toEqual(
      new Map([
        ['first', ['middle']],
        ['middle', ['last']],
        ['last', []],
      ]),
    );
  });

  it('orders a diamond with both parents before the merge', () => {
    const compiled = compileGraph({
      nodes: [
        node('merge', 'merge'),
        node('right', 'delay'),
        node('trigger', 'manual-trigger'),
        node('left', 'delay'),
      ],
      edges: [
        edge('trigger', 'left'),
        edge('trigger', 'right'),
        edge('left', 'merge'),
        edge('right', 'merge'),
      ],
    });

    expect(compiled.topologicalOrder).toEqual(['trigger', 'left', 'right', 'merge']);
    expect(compiled.parents.get('merge')).toEqual(['left', 'right']);
    expect(compiled.children.get('left')).toEqual(['merge']);
    expect(compiled.children.get('right')).toEqual(['merge']);
  });

  it('indexes both branches of a condition and their terminal nodes', () => {
    const graph = {
      nodes: [
        node('trigger', 'manual-trigger'),
        node('condition', 'condition', { expression: '{{ input.approved }}' }),
        node('yes', 'delay'),
        node('no', 'delay'),
      ],
      edges: [
        edge('trigger', 'condition'),
        { ...edge('condition', 'yes'), sourceHandle: 'true' },
        { ...edge('condition', 'no'), sourceHandle: 'false' },
      ],
    };
    const compiled = compileGraph(graph);

    expect(compiled.topologicalOrder).toEqual(['trigger', 'condition', 'yes', 'no']);
    expect(compiled.children.get('condition')).toEqual(['yes', 'no']);
    expect(compiled.parents.get('yes')).toEqual(['condition']);
    expect(compiled.parents.get('no')).toEqual(['condition']);
    expect(compiled.children.get('yes')).toEqual([]);
    expect(compiled.children.get('no')).toEqual([]);
  });

  it('rejects a reachable cycle and reports its participating nodes', () => {
    const compile = () =>
      compileGraph({
        nodes: [node('trigger', 'manual-trigger'), node('a', 'delay'), node('b', 'delay')],
        edges: [edge('trigger', 'a'), edge('a', 'b'), edge('b', 'a')],
      });

    expect(compile).toThrow(
      expect.objectContaining({
        name: 'GraphCompilationError',
        problems: expect.arrayContaining([
          expect.objectContaining({ code: 'cycle', nodeIds: ['a', 'b'] }),
        ]),
      }),
    );
  });

  it('propagates shared configuration validation errors', () => {
    expect(() =>
      compileGraph({
        nodes: [node('trigger', 'manual-trigger'), node('llm', 'llm')],
        edges: [edge('trigger', 'llm')],
      }),
    ).toThrow(
      expect.objectContaining({
        problems: expect.arrayContaining([
          expect.objectContaining({ code: 'invalid-config', nodeIds: ['llm'] }),
        ]),
      }),
    );
  });

  it('rejects duplicate node IDs and empty workflows', () => {
    expect(() =>
      compileGraph({
        nodes: [node('same', 'manual-trigger'), node('same', 'delay')],
        edges: [],
      }),
    ).toThrow('Duplicate node ID: same.');
    expect(() => compileGraph({ nodes: [], edges: [] })).toThrow(
      'The workflow needs a trigger to start from.',
    );
  });

  it('counts parallel edges between the same nodes as one dependency', () => {
    const compiled = compileGraph({
      nodes: [node('trigger', 'manual-trigger'), node('step', 'delay')],
      edges: [edge('trigger', 'step'), { ...edge('trigger', 'step'), id: 'second' }],
    });

    expect(compiled.topologicalOrder).toEqual(['trigger', 'step']);
    expect(compiled.children.get('trigger')).toEqual(['step']);
    expect(compiled.parents.get('step')).toEqual(['trigger']);
  });
});
