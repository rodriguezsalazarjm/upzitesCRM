import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Estados semánticos UPZITES FLOW (un estado = un color, siempre):
 *  success → Lime   (conectado, ganado, ok)
 *  warning → Solar  (requiere atención)
 *  danger  → Tomato (error, reconexión, crítico)
 *  info    → Electric (informativo / en curso)
 *  ai      → Ink    (IA)
 *  neutral / outline → sin estado
 * `destructive` se mantiene como alias de `danger` por compatibilidad.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-4 transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-carbon text-canvas',
        neutral: 'border-transparent bg-ivory text-slate-700',
        secondary: 'border-transparent bg-ivory text-slate-700',
        outline: 'border-slate-300 bg-transparent text-slate-700',
        success: 'border-transparent bg-lime/35 text-emerald-700',
        warning: 'border-transparent bg-solar/30 text-amber-700',
        danger: 'border-transparent bg-tomato/12 text-red-700',
        destructive: 'border-transparent bg-tomato/12 text-red-700',
        info: 'border-transparent bg-electric/10 text-blue-700',
        ai: 'border-transparent bg-ink text-lime',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
