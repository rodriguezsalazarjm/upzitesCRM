import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Cabecera de página editorial: título display + descripción en ash sobre el
 * canvas (sin barra ni borde). `actions` a la derecha. Presentacional: el
 * `Header` del layout lo compone con búsqueda/notificaciones/acción.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-3 py-5 pl-16 pr-4 sm:px-8 sm:pb-4 sm:pt-7 md:pl-8',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && <p className="type-eyebrow mb-1.5 text-soft">{eyebrow}</p>}
        <h1 className="type-display text-[40px] text-carbon sm:text-[52px]">{title}</h1>
        {description && <p className="mt-1.5 text-sm text-ash">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2.5">{actions}</div>}
    </header>
  );
}
