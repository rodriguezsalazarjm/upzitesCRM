'use client';

import Link from 'next/link';
import { Bell, Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface HeaderProps {
  title: string;
  subtitle?: string;
  action?: { label: string; href?: string };
}

export function Header({ title, subtitle, action }: HeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-white px-6">
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

        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className="h-4 w-4 text-slate-500" />
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-blue-500" />
        </Button>

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
