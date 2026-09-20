import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Superficie base. Radio 20px, hairline, sin sombra.
 *  default → Paper sobre canvas (la mayoría de los módulos).
 *  sunken  → Ivory, para módulos secundarios o bloques anidados.
 *  dark    → Carbon: módulos de mayor densidad (tablas, listas).
 *  ink     → Ink: módulo destacado / IA.
 * Las variantes oscuras reasignan los tokens de texto para que los
 * hijos (CardTitle, CardDescription, eyebrows) se lean sin clases extra.
 */
const cardVariants = cva('rounded-2xl border', {
  variants: {
    tone: {
      default: 'border-line bg-card text-card-foreground',
      sunken: 'border-transparent bg-ivory text-card-foreground',
      dark: 'border-transparent bg-carbon text-canvas [--card-muted:#a8a69c]',
      ink: 'border-transparent bg-ink text-canvas [--card-muted:#8fa7b3]',
    },
  },
  defaultVariants: { tone: 'default' },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, tone, ...props }, ref) => (
  <div ref={ref} className={cn(cardVariants({ tone }), className)} {...props} />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-base font-bold leading-tight tracking-tight', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-soft', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, cardVariants };
