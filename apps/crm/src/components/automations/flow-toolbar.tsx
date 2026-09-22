'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';

/**
 * Barra superior del Builder: nombre, versión/estado y acciones. Publish es
 * la única acción primaria (Electric); el resto queda en outline/ghost.
 * Puramente presentacional — todos los callbacks vienen del padre.
 */
export function FlowToolbar({
  name,
  onNameChange,
  readonly,
  canManage,
  busy,
  version,
  onValidate,
  onSaveDraft,
  onPublish,
  onNewDraft,
}: {
  name: string;
  onNameChange: (value: string) => void;
  readonly: boolean;
  canManage: boolean;
  busy: boolean;
  version: { status: string; version: number };
  onValidate: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  onNewDraft: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        aria-label="Nombre del flujo"
        className="max-w-sm font-semibold"
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
              Crear nuevo Draft
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" disabled={busy} onClick={onValidate}>
                Validar
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={onSaveDraft}>
                Guardar Draft
              </Button>
              <Button size="sm" disabled={busy} onClick={onPublish}>
                {busy && <Loader2 className="animate-spin" aria-hidden />}
                Publish
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
