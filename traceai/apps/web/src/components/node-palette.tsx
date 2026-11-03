'use client';

import type { DragEvent } from 'react';
import {
  NODE_DRAG_TYPE,
  nodeCatalog,
  nodeCategories,
} from '@/lib/node-catalog';

export function NodePalette() {
  function handleDragStart(event: DragEvent<HTMLLIElement>, type: string) {
    event.dataTransfer.setData(NODE_DRAG_TYPE, type);
    event.dataTransfer.effectAllowed = 'move';
  }

  return (
    <aside className="h-screen w-64 shrink-0 overflow-y-auto border-r bg-background p-4">
      <h2 className="mb-4 text-sm font-semibold tracking-tight">Nodes</h2>

      <div className="space-y-6">
        {nodeCategories.map((category) => {
          const items = nodeCatalog.filter((item) => item.category === category);

          return (
            <section key={category}>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {category}
              </h3>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li
                    key={item.type}
                    draggable
                    onDragStart={(event) => handleDragStart(event, item.type)}
                    className="cursor-grab rounded-md border bg-card px-3 py-2 active:cursor-grabbing"
                  >
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </aside>
  );
}