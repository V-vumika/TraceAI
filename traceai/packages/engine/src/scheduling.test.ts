import { expect, it } from 'vitest';
import { compileGraph, nextPendingStatus } from './index';

const graph = compileGraph({
  nodes: [
    { id: 'trigger', data: { nodeType: 'manual-trigger' } },
    { id: 'condition', data: { nodeType: 'condition', config: { expression: 'true' } } },
    { id: 'all', data: { nodeType: 'merge' } },
    { id: 'any', data: { nodeType: 'merge', config: { mode: 'any' } } },
  ],
  edges: [
    { id: 'start', source: 'trigger', target: 'condition' },
    ...['all', 'any'].flatMap((target) => [
      { id: `trigger-${target}`, source: 'trigger', target },
      { id: `true-${target}`, source: 'condition', target, sourceHandle: 'true' },
      { id: `other-${target}`, source: 'condition', target, sourceHandle: 'another' },
    ]),
  ],
});

it.each([
  {
    name: 'one success',
    trigger: 'succeeded',
    condition: 'running',
    branch: null,
    all: 'pending',
    any: 'queued',
  },
  {
    name: 'a selected edge among parallel edges',
    trigger: 'skipped',
    condition: 'succeeded',
    branch: 'true',
    all: 'queued',
    any: 'queued',
  },
  {
    name: 'an untaken path with another success',
    trigger: 'succeeded',
    condition: 'succeeded',
    branch: 'false',
    all: 'queued',
    any: 'queued',
  },
  {
    name: 'only skipped paths',
    trigger: 'skipped',
    condition: 'succeeded',
    branch: 'false',
    all: 'skipped',
    any: 'skipped',
  },
  {
    name: 'an unfinished path and a skipped path',
    trigger: 'running',
    condition: 'skipped',
    branch: null,
    all: 'pending',
    any: 'pending',
  },
  {
    name: 'a failed parent',
    trigger: 'failed',
    condition: 'succeeded',
    branch: null,
    all: 'pending',
    any: 'queued',
  },
])('handles $name', ({ trigger, condition, branch, all, any }) => {
  const steps = new Map([
    ['trigger', { status: trigger, branch: null }],
    ['condition', { status: condition, branch }],
  ]);
  expect(nextPendingStatus(graph, 'all', steps)).toBe(all);
  expect(nextPendingStatus(graph, 'any', steps)).toBe(any);
});
