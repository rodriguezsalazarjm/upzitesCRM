import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Botón UPZITES FLOW.
 * - default  → Electric: la acción primaria (una por vista).
 * - dark     → Carbon: acción fuerte sobre superficies claras.
 * - inverse  → Off-white: acción primaria sobre superficies Carbon/Ink.
 * - outline / secondary / ghost / link: acciones de apoyo.
 * Sin sombras; el press baja 1px. Radio de control: 12px.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-[background-color,color,border-color,transform] duration-200 ease-out active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-electric text-white hover:bg-electric-strong active:bg-electric-press',
        dark: 'bg-carbon text-canvas hover:bg-carbon/90',
        inverse: 'bg-canvas text-carbon hover:bg-white',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-danger-ink',
        outline: 'border border-mist bg-paper text-carbon hover:border-carbon hover:bg-canvas',
        secondary: 'bg-ivory text-carbon hover:bg-line',
        ghost: 'text-graphite hover:bg-ivory hover:text-carbon',
        link: 'text-electric underline underline-offset-4 hover:text-electric-strong',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 px-3 text-[13px]',
        lg: 'h-12 px-6 text-[15px]',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
