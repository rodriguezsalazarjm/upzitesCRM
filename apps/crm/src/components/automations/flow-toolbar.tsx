'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';

export type FlowAction = 'save' | 'publish' | 'draft' | 'validate';

/**
 * Barra superior del Builder: nombre, versión/estado y acciones. Publish es
 * la única acción primaria (Electric); el resto queda en outline/ghost.
 * `busyAction` (en vez de un booleano) permite que el botón que está
 * corriendo muestre su propio spinner+label, sin inventar un estado nuevo:
 * sigue siendo la misma llamada a `action()` de siempre.
 */
export function FlowToolbar({
  name,
  onNameChange,
  readonly,
  canManage,
  busyAction,
  version,
  compact = false,
  onValidate,
  onSaveDraft,
  onPublish,
  onNewDraft,
}: {
  name: string;
  onNameChange: (value: string) => void;
  readonly: boolean;
  canManage: boolean;
  busyAction: FlowAction | null;
  version: { status: string; version: number };
  compact?: boolean;
  onValidate: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  onNewDraft: () => void;
}) {
  const busy = busyAction !== null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        aria-label="Nombre del flujo"
        className={compact ? 'w-full max-w-none font-semibold sm:w-auto sm:max-w-xs' : 'max-w-sm font-semibold'}
        disabled={readonly}
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
      />
      <StatusBadge tone={version.status === 'PUBLISHED' ? 'success' : 'draft'}>
        v{version.version} · {version.status === 'PUBLISHED' ? 'Publicado' : version.status === 'DRAFT' ? 'Borrador' : version.status}
      </StatusBadge>
      {canManage && (
        <div className="flex flex-wrap gap-2">
          {readonly ? (
            <Button size="sm" disabled={busy} onClick={onNewDraft}>
              {busyAction === 'draft' && <Loader2 className="animate-spin" aria-hidden />}
              Crear nuevo Draft
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" disabled={busy} onClick={onValidate}>
                {busyAction === 'validate' && <Loader2 className="animate-spin" aria-hidden />}
                Validar
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={onSaveDraft}>
                {busyAction === 'save' && <Loader2 className="animate-spin" aria-hidden />}
                {compact ? 'Guardar' : 'Guardar Draft'}
              </Button>
              <Button size="sm" disabled={busy} onClick={onPublish}>
                {busyAction === 'publish' && <Loader2 className="animate-spin" aria-hidden />}
                Publish
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
