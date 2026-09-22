import * as React from 'react';
import { CircleAlert, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

/**
 * Barra de guardado contextual: aparece bajo el formulario cuando hay algo
 * que guardar (dirty), mientras se guarda, o si falló. No es un bar global —
 * cada formulario de esta pantalla tiene su propio dirty state, así que la
 * barra vive junto a su formulario, no fija a la ventana.
 */
export function SaveBar({
  state,
  saveLabel = 'Guardar cambios',
  errorMessage,
  onCancel,
  disabled,
  className,
}: {
  state: SaveState;
  saveLabel?: string;
  errorMessage?: string | null;
  onCancel?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  if (state === 'idle') return null;
  const busy = state === 'saving';

  return (
    <div className={cn('flex flex-wrap items-center gap-3 border-t border-line pt-4', className)}>
      <Button type="submit" size="sm" disabled={busy || disabled || state === 'saved'}>
        {busy && <Loader2 className="animate-spin" aria-hidden />}
        {busy ? 'Guardando…' : saveLabel}
      </Button>
      {onCancel && state === 'dirty' && (
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          Cancelar
        </Button>
      )}
      {state === 'dirty' && (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-warning-ink">
          <CircleAlert className="h-3.5 w-3.5" aria-hidden />
          Tienes cambios sin guardar
        </span>
      )}
      {state === 'saved' && (
        <span role="status" className="text-xs font-medium text-success-ink">
          Guardado
        </span>
      )}
      {state === 'error' && errorMessage && (
        <span role="alert" className="text-xs font-medium text-danger-ink">
          {errorMessage}
        </span>
      )}
    </div>
  );
}
