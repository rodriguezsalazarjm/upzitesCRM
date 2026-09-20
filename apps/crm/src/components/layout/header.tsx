'use client';

import Link from 'next/link';
import { Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PushNotificationsButton } from '@/components/pwa/push-notifications-button';

interface HeaderProps {
  title: string;
  subtitle?: string;
  action?: { label: string; href?: string };
}

/**
 * Cabecera de página editorial: título display grande + subtítulo en ash,
 * sobre el canvas (sin barra ni borde). Acciones a la derecha.
 */
export function Header({ title, subtitle, action }: HeaderProps) {
  return (
    <header className="flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-3 py-5 pl-16 pr-4 sm:px-8 sm:pb-4 sm:pt-7 md:pl-8">
      <div className="min-w-0">
        <h1 className="type-display text-[40px] text-carbon sm:text-[52px]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2.5">
        <div className="relative hidden md:block">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" strokeWidth={1.75} />
          <Input placeholder="Buscar..." className="h-10 w-60 rounded-full pl-10 text-[13px]" />
        </div>

        <PushNotificationsButton />

        {action && (
          <Button asChild>
            <Link href={action.href ?? '#'}>
              <Plus strokeWidth={2} />
              {action.label}
            </Link>
          </Button>
        )}
      </div>
    </header>
  );
}
