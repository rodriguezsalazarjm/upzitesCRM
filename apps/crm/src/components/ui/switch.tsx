'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export type SwitchProps = {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Nombre accesible obligatorio cuando el switch no tiene un <label htmlFor> visible al lado. */
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
};

/**
 * Switch accesible (role=switch, operable con Espacio/Enter vía <button>).
 * Pista mist/electric, thumb blanco. Sin librería: es un solo control, no
 * justifica una dependencia nueva.
 */
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, disabled, id, className, ...aria }, ref) => (
    <button
      ref={ref}
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-electric' : 'bg-mist',
        className,
      )}
      {...aria}
    >
      <span
        aria-hidden
        className={cn(
          'inline-block h-[18px] w-[18px] translate-x-1 rounded-full bg-paper shadow-[0_1px_2px_rgba(17,17,17,0.25)] transition-transform',
          checked && 'translate-x-[22px]',
        )}
      />
    </button>
  ),
);
Switch.displayName = 'Switch';
