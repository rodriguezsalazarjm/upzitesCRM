'use client';

import * as React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TabItem = {
  value: string;
  label: string;
  count?: number;
  icon?: LucideIcon;
  /**
   * Icono ya renderizado (`<Icon />`). Obligatorio usarlo en vez de `icon` cuando
   * los items se construyen en un Server Component: un componente no cruza a client.
   */
  iconElement?: React.ReactNode;
  /** Solo icono: `label` pasa a ser el nombre accesible. */
  iconOnly?: boolean;
  /** Tooltip nativo; útil con `iconOnly`. */
  title?: string;
  /** Si hay href, el item es un enlace (navegación por URL). */
  href?: string;
};

/**
 * Control segmentado UPZITES FLOW.
 *  semantics="tabs"   → role=tablist/tab (cambia entre vistas/paneles), flechas ←→ Home End.
 *  semantics="filter" → grupo de botones con aria-pressed (filtra el mismo contenido).
 * Controlado: `value` + `onValueChange`.
 */
export function Tabs({
  items,
  value,
  onValueChange,
  semantics = 'tabs',
  ariaLabel,
  className,
}: {
  items: TabItem[];
  value: string;
  onValueChange?: (value: string) => void;
  semantics?: 'tabs' | 'filter';
  ariaLabel: string;
  className?: string;
}) {
  const refs = React.useRef<Array<HTMLElement | null>>([]);
  const isTabs = semantics === 'tabs';

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    if (!isTabs) return;
    const last = items.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    refs.current[next]?.focus();
    onValueChange?.(items[next].value);
  }

  return (
    <div
      role={isTabs ? 'tablist' : 'group'}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-ivory p-1',
        className,
      )}
    >
      {items.map((item, index) => {
        const selected = item.value === value;
        const Icon = item.icon;
        const classes = cn(
          'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full text-[13px] font-semibold transition-colors',
          item.iconOnly ? 'w-8 justify-center' : 'px-3.5',
          selected ? 'bg-carbon text-canvas' : 'text-graphite hover:bg-line hover:text-carbon',
        );
        const content = (
          <>
            {item.iconElement ?? (Icon && <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />)}
            {item.iconOnly ? <span className="sr-only">{item.label}</span> : item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  'tabular rounded-full px-1.5 text-[11px] leading-[18px]',
                  selected ? 'bg-white/15 text-canvas' : 'bg-paper text-ash',
                )}
              >
                {item.count}
              </span>
            )}
          </>
        );

        if (item.href) {
          return (
            <Link
              key={item.value}
              href={item.href}
              ref={(node) => {
                refs.current[index] = node;
              }}
              className={classes}
              title={item.title}
              aria-current={selected ? 'page' : undefined}
            >
              {content}
            </Link>
          );
        }
        return (
          <button
            key={item.value}
            type="button"
            ref={(node) => {
              refs.current[index] = node;
            }}
            className={classes}
            title={item.title}
            onClick={() => onValueChange?.(item.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            {...(isTabs
              ? { role: 'tab', 'aria-selected': selected, tabIndex: selected ? 0 : -1 }
              : { 'aria-pressed': selected })}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
