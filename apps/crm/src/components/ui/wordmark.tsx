import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Lockup de marca: icono Electric + "Upzites" (Bebas) + pill "Flow" en Lime.
 * Único lugar que dibuja el wordmark — lo usan Sidebar y las páginas de auth.
 *  tone="dark"  → texto canvas, para superficies Carbon/Ink.
 *  tone="light" → texto carbon, para superficies claras.
 */
export function Wordmark({
  size = 'sm',
  tone = 'light',
  subtitle,
  className,
}: {
  size?: 'sm' | 'lg';
  tone?: 'light' | 'dark';
  subtitle?: React.ReactNode;
  className?: string;
}) {
  const big = size === 'lg';
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-lg bg-electric',
          big ? 'h-11 w-11 rounded-xl' : 'h-9 w-9',
        )}
      >
        <ArrowUpRight className={cn('text-white', big ? 'h-6 w-6' : 'h-5 w-5')} strokeWidth={2.5} />
      </span>
      <div className="min-w-0">
        <p
          className={cn(
            'type-display flex items-center gap-1.5 leading-none',
            big ? 'text-[30px]' : 'text-[22px]',
            tone === 'dark' ? 'text-canvas' : 'text-carbon',
          )}
        >
          Upzites
          <span
            className={cn(
              'rounded bg-lime pb-px pt-[3px] leading-none text-carbon',
              big ? 'px-2 text-[13px]' : 'px-1.5 text-[11px]',
            )}
          >
            Flow
          </span>
        </p>
        {subtitle && (
          <p className={cn('mt-1 truncate text-[11px] leading-none', tone === 'dark' ? 'text-fog' : 'text-soft')}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
