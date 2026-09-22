import * as React from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Bloque para UNA acción irreversible: franja Tomato a la izquierda, texto
 * claro de la consecuencia, botón destructivo. No es un contenedor de lista;
 * para varias acciones irreversibles, repetir el bloque.
 */
export function DangerZone({
  title,
  description,
  actionLabel,
  onAction,
  busy,
  disabled,
  className,
}: {
  title: React.ReactNode;
  description: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
  busy?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-tomato/30 bg-tomato/[0.04] py-4 pl-4 pr-4 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger-ink" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-carbon">{title}</p>
          <p className="mt-0.5 text-xs leading-5 text-soft">{description}</p>
        </div>
      </div>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="shrink-0"
        disabled={disabled || busy}
        onClick={onAction}
      >
        {busy ? 'Procesando…' : actionLabel}
      </Button>
    </div>
  );
}
