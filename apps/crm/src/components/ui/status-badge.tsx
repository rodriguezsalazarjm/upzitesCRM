import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Estado con significado fijo (un estado = un color, siempre):
 *  success Lime · warning Solar · danger Tomato · info Electric ·
 *  ai Ink+Lime (IA/automatización) · ink Ink (etapa intermedia) ·
 *  neutral ash · draft neutral hueco (borrador / sin publicar).
 *
 * variant="soft"  → pill tintada (estado relevante, se debe ver a la primera).
 * variant="dot"   → punto + texto neutro (tablas y tarjetas densas: el color
 *                   queda en el punto, no en toda la fila).
 */
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'ai' | 'ink' | 'draft';

const SOFT: Record<StatusTone, string> = {
  neutral: 'bg-ivory text-graphite',
  info: 'bg-electric/10 text-info-ink',
  success: 'bg-lime/35 text-success-ink',
  warning: 'bg-solar/30 text-warning-ink',
  danger: 'bg-tomato/12 text-danger-ink',
  ai: 'bg-ink text-lime',
  ink: 'bg-ink/10 text-ink',
  draft: 'border border-dashed border-mist bg-transparent text-graphite',
};

const DOT: Record<StatusTone, string> = {
  neutral: 'bg-stone',
  info: 'bg-electric',
  success: 'bg-lime ring-1 ring-success-ink/30',
  warning: 'bg-solar',
  danger: 'bg-tomato',
  ai: 'bg-ink',
  ink: 'bg-ink',
  draft: 'border-[1.5px] border-stone bg-transparent',
};

const DOT_ON_DARK: Partial<Record<StatusTone, string>> = {
  ai: 'bg-lime',
  ink: 'bg-canvas',
  neutral: 'bg-fog',
  success: 'bg-lime',
  draft: 'border-[1.5px] border-fog bg-transparent',
};

export function StatusBadge({
  tone = 'neutral',
  variant = 'soft',
  onDark = false,
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: StatusTone;
  variant?: 'soft' | 'dot';
  onDark?: boolean;
}) {
  if (variant === 'dot') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-2 text-[13px] font-medium',
          onDark ? 'text-canvas' : 'text-graphite',
          className,
        )}
        {...props}
      >
        <span className={cn('h-2 w-2 shrink-0 rounded-full', (onDark && DOT_ON_DARK[tone]) || DOT[tone])} aria-hidden />
        {children}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold leading-4',
        SOFT[tone],
        className,
      )}
      {...props}
    >
      {tone !== 'draft' && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
