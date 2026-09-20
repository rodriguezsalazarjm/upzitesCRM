import * as React from 'react';
import { cn } from '@/lib/utils';

/** Bloque de carga. El pulso se apaga solo con prefers-reduced-motion (globals.css). */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn('animate-pulse rounded-lg bg-ivory', className)} {...props} />;
}
