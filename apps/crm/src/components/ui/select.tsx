import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Select nativo con estilo de sistema. Se mantiene el <select> del navegador
 * (teclado, móvil y lectores de pantalla gratis). `className` va al <select>;
 * `wrapperClassName` al contenedor (ancho).
 */
export type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
  wrapperClassName?: string;
  density?: 'default' | 'sm';
};

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, wrapperClassName, density = 'default', children, ...props }, ref) => (
    <div className={cn('relative w-full', wrapperClassName)}>
      <select
        ref={ref}
        className={cn(
          'w-full appearance-none rounded-lg border border-mist bg-paper pl-3.5 pr-9 text-sm text-carbon transition-colors hover:border-stone focus-visible:border-electric focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-electric/30 disabled:cursor-not-allowed disabled:opacity-50',
          density === 'sm' ? 'h-8 text-[13px]' : 'h-10',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ash"
        strokeWidth={1.75}
        aria-hidden
      />
    </div>
  ),
);
Select.displayName = 'Select';

export { Select };
