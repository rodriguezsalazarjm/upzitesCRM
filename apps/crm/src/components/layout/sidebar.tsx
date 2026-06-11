'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, TrendingUp, Activity,
  Settings, ChevronRight, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/contactos', label: 'Contactos', icon: Users, badge: '34' },
  { href: '/oportunidades', label: 'Pipeline', icon: TrendingUp, badge: '6' },
  { href: '/actividades', label: 'Actividades', icon: Activity },
  { href: '/configuracion', label: 'Configuración', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-[240px] flex-col border-r bg-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">CRM Upzites</p>
          <p className="text-[10px] text-slate-400 leading-none">v1.0</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          Principal
        </p>
        <ul className="space-y-0.5">
          {navItems.slice(0, 4).map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
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
                  <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600')} />
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className={cn(
                      'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                      active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500',
                    )}>
                      {item.badge}
                    </span>
                  )}
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
          {navItems.slice(4).map((item) => {
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

      {/* User */}
      <div className="border-t p-4">
        <div className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-50 cursor-pointer">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-semibold">AG</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-800">Ana García</p>
            <p className="truncate text-[10px] text-slate-400">admin@upzites.cl</p>
          </div>
          <Badge variant="success" className="text-[9px] px-1.5 py-0">Pro</Badge>
        </div>
      </div>
    </aside>
  );
}
