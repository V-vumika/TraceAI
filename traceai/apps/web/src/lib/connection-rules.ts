import type { Edge, Node } from '@xyflow/react';
import { nodeCatalog } from '@/lib/node-catalog';

type Link = { source: string; target: string };

function isTrigger(node: Node | undefined) {
  const nodeType = node?.data?.nodeType;
  const item = nodeCatalog.find((entry) => entry.type === nodeType);
  return item?.category === 'Triggers';
}

// Can we walk from link.target back to link.source using the existing edges?
// If yes, adding link.source -> link.target would close a loop.
function createsCycle(link: Link, edges: Edge[]) {
  const stack = [link.target];
  const seen = new Set<string>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    if (current === link.source) return true;
    if (seen.has(current)) continue;
    seen.add(current);

    for (const edge of edges) {
      if (edge.source === current) stack.push(edge.target);
    }
  }

  return false;
}

// Returns a reason string if the connection is not allowed, otherwise null.
export function getConnectionError(
  link: Link,
  nodes: Node[],
  edges: Edge[],
): string | null {
  if (link.source === link.target) {
    return 'A node cannot connect to itself.';
  }

  const targetNode = nodes.find((node) => node.id === link.target);
  if (isTrigger(targetNode)) {
    return 'A trigger cannot have an incoming connection.';
  }

  if (createsCycle(link, edges)) {
    return 'This connection would create a cycle.';
  }

  return null;
}