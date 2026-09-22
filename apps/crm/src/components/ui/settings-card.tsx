import * as React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Superficie estándar de una pantalla de configuración: icono + título +
 * descripción sobre un hairline, cuerpo con aire. Un nivel de card, no dos
 * (sin cards anidadas dentro del cuerpo).
 */
export function SettingsCard({
  icon: Icon,
  title,
  description,
  actions,
  className,
  bodyClassName,
  children,
}: {
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="flex items-start gap-3 border-b border-line p-5 sm:p-6">
        {Icon && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ivory text-carbon">
            <Icon className="h-5 w-5" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-carbon">{title}</h2>
          {description && <p className="mt-1 text-sm leading-5 text-soft">{description}</p>}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      <div className={cn('p-5 sm:p-6', bodyClassName)}>{children}</div>
    </Card>
  );
}

/** SettingsCard anclable por id, para la navegación lateral de Configuración. */
export function SettingsSection({
  id,
  className,
  ...props
}: React.ComponentProps<typeof SettingsCard> & { id: string }) {
  return (
    <section id={id} className="scroll-mt-6">
      <SettingsCard className={className} {...props} />
    </section>
  );
}
