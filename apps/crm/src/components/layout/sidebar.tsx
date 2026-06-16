'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Bot,
  ChevronRight,
  CreditCard,
  Globe2,
  LayoutDashboard,
  PlugZap,
  ShieldCheck,
  Settings,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { CurrentUser } from '@/lib/auth';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/contactos', label: 'Contactos', icon: Users },
  { href: '/oportunidades', label: 'Pipeline', icon: TrendingUp },
  { href: '/actividades', label: 'Actividades', icon: Activity },
  { href: '/fuentes', label: 'Fuentes', icon: Globe2 },
  { href: '/integraciones', label: 'Integraciones', icon: PlugZap },
  { href: '/automatizaciones', label: 'Automatizaciones', icon: Bot },
  { href: '/insights', label: 'Insights IA', icon: Bot },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/ops', label: 'Ops', icon: ShieldCheck },
  { href: '/configuracion', label: 'Configuracion', icon: Settings },
];

function getInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function Sidebar({ user }: { user: CurrentUser }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-[240px] flex-col border-r bg-white">
      <div className="flex h-16 items-center gap-3 border-b px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">CRM Upzites</p>
          <p className="text-[10px] leading-none text-slate-400">{user.workspace.name}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          Principal
        </p>
        <ul className="space-y-0.5">
          {navItems.slice(0, 10).map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                    active
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  )}
                >
                  <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-blue-600' : 'text-slate-400')} />
                  <span className="flex-1">{item.label}</span>
                  {active && <ChevronRight className="h-3 w-3 text-blue-400" />}
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="mb-2 mt-6 px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          Sistema
        </p>
        <ul className="space-y-0.5">
          {navItems.slice(10).map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                    active
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  )}
                >
                  <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-blue-600' : 'text-slate-400')} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t p-4">
        <div className="flex items-center gap-3 rounded-lg p-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-blue-100 text-xs font-semibold text-blue-700">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-800">{user.name}</p>
            <p className="truncate text-[10px] text-slate-400">{user.email}</p>
          </div>
          <Badge variant="success" className="px-1.5 py-0 text-[9px]">
            {user.role}
          </Badge>
        </div>
        <form action="/api/auth/logout" method="post" className="mt-2">
          <Button type="submit" variant="ghost" className="h-8 w-full justify-start text-xs text-slate-500">
            Cerrar sesion
          </Button>
        </form>
      </div>
    </aside>
  );
}
