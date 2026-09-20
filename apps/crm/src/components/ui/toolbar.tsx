'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Toolbar: fila de controles (búsqueda, filtros, acciones) sobre el canvas.
 * FilterBar: la misma fila como cabecera de un módulo Paper (encima de una tabla).
 * ToolbarSpacer empuja lo que sigue al extremo derecho.
 */
export function Toolbar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-wrap items-center gap-2.5', className)} {...props} />;
}

export function FilterBar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-3 sm:px-5', className)}
      {...props}
    />
  );
}

export function ToolbarSpacer({ className }: { className?: string }) {
  return <div className={cn('ml-auto', className)} aria-hidden />;
}

export function ToolbarSearch({
  label,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={cn('relative block w-full sm:w-72', className)}>
      <span className="sr-only">{label}</span>
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone"
        strokeWidth={1.75}
        aria-hidden
      />
      <input
        type="search"
        className="h-9 w-full rounded-full border border-mist bg-paper pl-10 pr-4 text-[13px] text-carbon transition-colors placeholder:text-stone hover:border-stone focus-visible:border-electric focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-electric/30"
        {...props}
      />
    </label>
  );
}
