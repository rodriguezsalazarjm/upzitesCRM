'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Tabla UPZITES FLOW. Semántica HTML real (table/thead/th scope="col").
 *  tone="light" → Paper con hairlines · tone="dark" → Carbon, para módulos densos.
 *  density="compact" | "comfortable".
 * El tono y la densidad viajan por data-attributes (group/table), sin contexto
 * de React. Para cabecera fija, dar altura acotada al contenedor (`containerClassName`).
 */
type TableProps = React.TableHTMLAttributes<HTMLTableElement> & {
  tone?: 'light' | 'dark';
  density?: 'compact' | 'comfortable';
  containerClassName?: string;
};

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ tone = 'light', density = 'comfortable', className, containerClassName, ...props }, ref) => (
    <div className={cn('relative w-full overflow-auto', containerClassName)}>
      <table
        ref={ref}
        data-tone={tone}
        data-density={density}
        className={cn(
          'group/table w-full border-collapse text-[13px] data-[tone=dark]:text-canvas',
          className,
        )}
        {...props}
      />
    </div>
  ),
);
Table.displayName = 'Table';

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  (props, ref) => <thead ref={ref} {...props} />,
);
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  (props, ref) => <tbody ref={ref} {...props} />,
);
TableBody.displayName = 'TableBody';

type Align = 'left' | 'right' | 'center';
const alignClass: Record<Align, string> = { left: 'text-left', right: 'text-right', center: 'text-center' };

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement> & { align?: Align }
>(({ className, align = 'left', ...props }, ref) => (
  <th
    ref={ref}
    scope="col"
    className={cn(
      'type-eyebrow sticky top-0 z-10 whitespace-nowrap border-b px-4 py-3 text-soft first:pl-6 last:pr-6',
      'group-data-[tone=light]/table:border-line group-data-[tone=light]/table:bg-paper',
      'group-data-[tone=dark]/table:border-white/10 group-data-[tone=dark]/table:bg-carbon',
      alignClass[align],
      className,
    )}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

type RowProps = React.HTMLAttributes<HTMLTableRowElement> & {
  /** Fila accionable: hover, foco por teclado y Enter/Espacio disparan onClick. */
  interactive?: boolean;
  selected?: boolean;
};

const TableRow = React.forwardRef<HTMLTableRowElement, RowProps>(
  ({ className, interactive, selected, onKeyDown, ...props }, ref) => (
    <tr
      ref={ref}
      data-selected={selected ? 'true' : undefined}
      aria-current={selected ? 'true' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          interactive &&
          !event.defaultPrevented &&
          event.target === event.currentTarget &&
          (event.key === 'Enter' || event.key === ' ')
        ) {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
      className={cn(
        'border-b transition-colors last:border-b-0',
        'group-data-[tone=light]/table:border-line group-data-[tone=dark]/table:border-white/10',
        '[&>td:first-child]:border-l-[3px] [&>td:first-child]:border-l-transparent',
        interactive && 'cursor-pointer outline-none focus-visible:bg-ivory group-data-[tone=dark]/table:focus-visible:bg-white/[0.08]',
        interactive &&
          'group-data-[tone=light]/table:hover:bg-canvas group-data-[tone=dark]/table:hover:bg-white/[0.05]',
        'data-[selected=true]:group-data-[tone=light]/table:bg-electric/[0.06] data-[selected=true]:group-data-[tone=light]/table:[&>td:first-child]:border-l-electric',
        'data-[selected=true]:group-data-[tone=dark]/table:bg-white/[0.08] data-[selected=true]:group-data-[tone=dark]/table:[&>td:first-child]:border-l-lime',
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = 'TableRow';

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement> & { align?: Align; muted?: boolean; numeric?: boolean }
>(({ className, align = 'left', muted, numeric, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      'px-4 align-middle first:pl-5 last:pr-6',
      'group-data-[density=comfortable]/table:py-3.5 group-data-[density=compact]/table:py-2.5',
      alignClass[numeric ? 'right' : align],
      numeric && 'tabular font-semibold',
      muted && 'text-soft',
      className,
    )}
    {...props}
  />
));
TableCell.displayName = 'TableCell';

/** Fila de estado vacío: icono fino + mensaje corto. */
function TableEmpty({
  colSpan,
  icon: Icon,
  title,
  description,
}: {
  colSpan: number;
  icon?: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-16 text-center">
        <div className="mx-auto flex max-w-xs flex-col items-center gap-2">
          {Icon && (
            <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-ivory text-ash">
              <Icon className="h-5 w-5" strokeWidth={1.5} />
            </span>
          )}
          <p className="text-[15px] font-bold">{title}</p>
          {description && <p className="text-sm text-soft">{description}</p>}
        </div>
      </td>
    </tr>
  );
}

/** Filas de carga (skeleton) con el mismo ritmo que la tabla real. */
function TableSkeletonRows({ rows = 6, cols }: { rows?: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, row) => (
        <tr key={row} aria-hidden className="border-b border-line last:border-b-0">
          {Array.from({ length: cols }).map((__, col) => (
            <td key={col} className="px-4 py-4 first:pl-6 last:pr-6">
              <div
                className="h-3.5 animate-pulse rounded-full bg-ivory"
                style={{ width: `${col === 0 ? 70 : 40 + ((row + col) % 3) * 15}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export { Table, TableHeader, TableBody, TableHead, TableRow, TableCell, TableEmpty, TableSkeletonRows };
