import { describe, expect, it } from 'vitest';
import {
  validateGraph,
  type GraphNode,
  type GraphProblem,
} from './graph-validator';

function node(
  id: string,
  nodeType: string,
  config?: Record<string, unknown>,
): GraphNode {
  return { id, data: { nodeType, ...(config ? { config } : {}) } };
}

function edge(source: string, target: string) {
  return { id: `${source}-${target}`, source, target };
}

function codes(problems: GraphProblem[]) {
  return problems.map((problem) => problem.code);
}

const llmConfig = { prompt: 'Summarise {{ input }}' };

describe('validateGraph', () => {
  it('accepts a valid linear workflow', () => {
    const problems = validateGraph({
      nodes: [node('t', 'manual-trigger'), node('a', 'llm', llmConfig)],
      edges: [edge('t', 'a')],
    });

    expect(problems).toEqual([]);
  });

  it('reports a missing required field', () => {
    const problems = validateGraph({
      nodes: [node('t', 'manual-trigger'), node('a', 'llm')],
      edges: [edge('t', 'a')],
    });

    expect(codes(problems)).toContain('invalid-config');
    expect(problems[0]?.nodeIds).toEqual(['a']);
  });

  it('reports invalid JSON in headers', () => {
    const problems = validateGraph({
      nodes: [
        node('t', 'manual-trigger'),
        node('h', 'http', { url: 'https://example.com', headers: '{oops' }),
      ],
      edges: [edge('t', 'h')],
    });

    expect(codes(problems)).toContain('invalid-json');
  });

  it('reports an unknown name inside {{ }}', () => {
    const problems = validateGraph({
      nodes: [
        node('t', 'manual-trigger'),
        node('a', 'llm', { prompt: 'Hello {{ foo }}' }),
      ],
      edges: [edge('t', 'a')],
    });

    expect(codes(problems)).toContain('bad-reference');
  });

  it('allows known names, functions, property access and quoted text', () => {
    const problems = validateGraph({
      nodes: [
        node('t', 'manual-trigger'),
        node('a', 'llm', {
          prompt: "{{ upper(input) }} {{ input.name }} {{ default(input, 'foo') }}",
        }),
      ],
      edges: [edge('t', 'a')],
    });

    expect(codes(problems)).not.toContain('bad-reference');
  });

  it('reports a node that no trigger can reach', () => {
    const problems = validateGraph({
      nodes: [
        node('t', 'manual-trigger'),
        node('a', 'llm', llmConfig),
        node('b', 'llm', llmConfig),
      ],
      edges: [edge('t', 'a')],
    });

    expect(codes(problems)).toEqual(['disconnected']);
    expect(problems[0]?.nodeIds).toEqual(['b']);
  });

  it('reports a workflow without a trigger', () => {
    const problems = validateGraph({
      nodes: [node('a', 'llm', llmConfig)],
      edges: [],
    });

    expect(codes(problems)).toContain('no-trigger');
  });

  it('reports an incoming edge on a trigger', () => {
    const problems = validateGraph({
      nodes: [node('t', 'manual-trigger'), node('a', 'llm', llmConfig)],
      edges: [edge('t', 'a'), edge('a', 't')],
    });

    expect(codes(problems)).toContain('trigger-incoming');
  });

  it('reports a cycle', () => {
    const problems = validateGraph({
      nodes: [
        node('t', 'manual-trigger'),
        node('a', 'llm', llmConfig),
        node('b', 'llm', llmConfig),
      ],
      edges: [edge('t', 'a'), edge('a', 'b'), edge('b', 'a')],
    });

    expect(codes(problems)).toContain('cycle');
  });

  it('reports an edge that points to a missing node', () => {
    const problems = validateGraph({
      nodes: [node('t', 'manual-trigger')],
      edges: [edge('t', 'ghost')],
    });

    expect(codes(problems)).toContain('dangling-edge');
  });
});