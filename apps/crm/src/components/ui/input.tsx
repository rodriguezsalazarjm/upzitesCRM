import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-lg border border-slate-300 bg-paper px-3.5 py-1 text-sm text-carbon transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-400 hover:border-slate-400 focus-visible:border-electric focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-electric/30 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
