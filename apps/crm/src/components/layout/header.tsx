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

export function Header({ title, subtitle, action }: HeaderProps) {
  return (
    <header className="flex min-h-16 shrink-0 items-center justify-between border-b bg-white py-3 pl-16 pr-4 sm:px-6">
      <div>
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden md:block">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <Input
            placeholder="Buscar..."
            className="h-8 w-56 pl-8 text-xs bg-slate-50 border-slate-200"
          />
        </div>

        <PushNotificationsButton />

        {action && (
          <Button size="sm" className="h-8 gap-1.5 text-xs" asChild>
            <Link href={action.href ?? '#'}>
              <Plus className="h-3.5 w-3.5" />
              {action.label}
            </Link>
          </Button>
        )}
      </div>
    </header>
  );
}
