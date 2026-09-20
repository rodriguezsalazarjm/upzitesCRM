import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Fila de automatización (regla o flujo). Presentacional: la lógica vive en
 * quien la usa. Icono → título/estado → cadena de chips → métricas → acciones.
 * Sirve de base visual para el listado de flujos y, más adelante, el Builder.
 */
export function AutomationRow({
  icon: Icon,
  title,
  description,
  status,
  chips,
  meta,
  actions,
  className,
}: {
  icon: LucideIcon;
  /** Texto o enlace (el nodo se renderiza tal cual dentro del h3). */
  title: React.ReactNode;
  description?: string | null;
  status?: React.ReactNode;
  chips?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <li className={cn('flex flex-col gap-4 p-5 sm:flex-row sm:items-start', className)}>
      <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ivory text-carbon sm:flex">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
      </span>

      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 className="text-[15px] font-bold leading-tight text-carbon">{title}</h3>
          {status}
        </div>
        {description && <p className="text-[13px] text-ash">{description}</p>}
        {chips && <div className="flex flex-wrap items-center gap-1.5">{chips}</div>}
        {meta && <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-soft">{meta}</div>}
      </div>

      {actions && <div className="flex shrink-0 items-center gap-1.5 sm:pt-0.5">{actions}</div>}
    </li>
  );
}

/** Cadena legible de una regla: Cuando (ancla oscura) → Si (borde) → acciones (ivory). */
export function RuleChip({
  kind,
  children,
}: {
  kind: 'trigger' | 'condition' | 'action';
  children: React.ReactNode;
}) {
  const styles = {
    trigger: 'bg-carbon text-canvas',
    condition: 'border border-mist text-graphite',
    action: 'bg-ivory text-graphite',
  } as const;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium', styles[kind])}>
      {children}
    </span>
  );
}

/** Salud de ejecuciones: completadas (Carbon) / fallidas (Tomato) / en curso (línea). */
export function RunHealth({ started, completed, failed }: { started: number; completed: number; failed: number }) {
  if (started === 0) return <span>Sin ejecuciones</span>;
  const pct = (n: number) => `${Math.min(100, (n / started) * 100)}%`;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="flex h-1.5 w-24 overflow-hidden rounded-full bg-line"
        role="img"
        aria-label={`${completed} completadas, ${failed} fallidas de ${started} iniciadas`}
      >
        <span className="h-full bg-carbon" style={{ width: pct(completed) }} />
        <span className="h-full bg-tomato" style={{ width: pct(failed) }} />
      </span>
      <span className="tabular">
        {completed}/{started} completadas
      </span>
    </span>
  );
}
