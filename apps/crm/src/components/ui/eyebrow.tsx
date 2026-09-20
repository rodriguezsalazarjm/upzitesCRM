import * as React from 'react';
import { cn } from '@/lib/utils';

/** Label pequeño en mayúsculas con tracking. Hereda color; por defecto ash. */
export function Eyebrow({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('type-eyebrow text-soft', className)} {...props} />;
}

/**
 * Encabezado de sección dentro de una página: eyebrow + título + acción
 * opcional a la derecha. Un solo patrón para todas las pantallas.
 */
export function SectionHeading({
  eyebrow,
  title,
  action,
  className,
}: {
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 className="mt-1 text-lg font-bold leading-tight tracking-tight">{title}</h2>
      </div>
      {action}
    </div>
  );
}
