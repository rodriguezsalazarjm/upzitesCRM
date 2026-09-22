import * as React from 'react';
import { Switch, type SwitchProps } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

/** Fila label + descripción a la izquierda, Switch a la derecha. Todo el bloque tiene el label asociado. */
export function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  id: string;
  label: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  className?: string;
} & Pick<SwitchProps, 'checked' | 'onCheckedChange'>) {
  return (
    <div className={cn('flex items-start justify-between gap-4 rounded-xl bg-ivory px-4 py-3.5', className)}>
      <div className="min-w-0">
        <label htmlFor={id} className={cn('block text-sm font-semibold text-carbon', disabled && 'opacity-60')}>
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs leading-5 text-soft">{description}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="mt-0.5" />
    </div>
  );
}
