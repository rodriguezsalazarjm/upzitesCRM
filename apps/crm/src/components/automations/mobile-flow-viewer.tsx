'use client';

import { useState } from 'react';
import { Drawer } from '@/components/ui/drawer';
import { Eyebrow } from '@/components/ui/eyebrow';
import { FlowEmptyState } from './flow-empty-state';
import { FlowOutlineEntry } from './flow-outline-view';
import type { OutlineEntry } from './flow-outline';
import { FlowInspector, type FlowInspectorProps } from './flow-inspector';
import type { FlowNode } from '@/lib/automations/schema';

/**
 * Viewer topológico para <768px (ver flow-outline.ts para por qué no es una
 * lista lineal). No intenta reproducir drag&drop de escritorio: permite
 * entender el flow, seleccionar un nodo, ver su estado/errores y su
 * configuración — la edición de campos usa el mismo FlowInspector, en un
 * drawer inferior en vez de columna fija.
 */
export function MobileFlowViewer({
  root,
  orphans,
  selected,
  onSelect,
  errors,
  inspector,
}: {
  root: OutlineEntry | null;
  orphans: FlowNode[];
  selected: string | undefined;
  onSelect: (id: string | undefined) => void;
  errors: string[];
  inspector: FlowInspectorProps;
}) {
  const [open, setOpen] = useState(false);

  function select(id: string) {
    onSelect(id);
    setOpen(true);
  }

  return (
    <div className="space-y-3">
      {!root && orphans.length === 0 ? (
        <FlowEmptyState variant="canvas" />
      ) : (
        <>
          {root && (
            <div>
              <Eyebrow className="mb-2">Recorrido del flow</Eyebrow>
              <ul>
                <FlowOutlineEntry entry={root} selected={selected} onSelect={select} errors={errors} />
              </ul>
            </div>
          )}
          {orphans.length > 0 && (
            <div>
              <Eyebrow className="mb-2">Sin conexión ({orphans.length})</Eyebrow>
              <ul className="space-y-2">
                {orphans.map((step) => (
                  <FlowOutlineEntry key={step.id} entry={{ kind: 'node', id: step.id, step, children: [] }} selected={selected} onSelect={select} errors={errors} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <Drawer open={open} onClose={() => setOpen(false)} title="Configuración del nodo" side="right" id="mobile-flow-inspector">
        <FlowInspector {...inspector} />
      </Drawer>
    </div>
  );
}
