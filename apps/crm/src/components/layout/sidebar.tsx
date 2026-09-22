'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Activity,
  Bot,
  CreditCard,
  Gauge,
  Globe2,
  LayoutDashboard,
  MessageSquare,
  Menu,
  Package,
  Receipt,
  Rocket,
  Send,
  FileText,
  PlugZap,
  ShieldCheck,
  Settings,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Wordmark } from '@/components/ui/wordmark';
import type { CurrentUser } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { LogoutForm } from './logout-form';

const navItems = [
  { href: '/onboarding', label: 'Puesta en marcha', icon: Rocket },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/inbox', label: 'Inbox', icon: MessageSquare },
  { href: '/contactos', label: 'Contactos', icon: Users },
  { href: '/oportunidades', label: 'Pipeline', icon: TrendingUp },
  { href: '/productos', label: 'Productos', icon: Package },
  { href: '/pedidos', label: 'Pedidos', icon: Receipt },
  { href: '/cotizaciones', label: 'Cotizaciones', icon: FileText },
  { href: '/actividades', label: 'Actividades', icon: Activity },
  { href: '/fuentes', label: 'Fuentes', icon: Globe2 },
  { href: '/integraciones', label: 'Integraciones', icon: PlugZap },
  { href: '/automatizaciones', label: 'Automatizaciones', icon: Bot },
  { href: '/recuperacion', label: 'Recuperacion', icon: Send },
  { href: '/ia/agente', label: 'IA · Agente', icon: Bot },
  { href: '/ia/conocimiento', label: 'IA · Conocimiento', icon: FileText },
  { href: '/insights', label: 'Insights IA', icon: Bot },
  { href: '/uso', label: 'Uso y costos', icon: Gauge },
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

function NavSection({ label, first }: { label: string; first?: boolean }) {
  return (
    <p
      className={cn(
        'mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-fog',
        !first && 'mt-7',
      )}
    >
      {label}
    </p>
  );
}

export function Sidebar({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function renderItems(items: typeof navItems, matchNested: boolean) {
    return (
      <ul className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || (matchNested && pathname.startsWith(`${item.href}/`));
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-canvas text-carbon'
                    : 'text-mist hover:bg-white/[0.07] hover:text-white',
                )}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0',
                    active ? 'text-electric' : 'text-fog group-hover:text-white',
                  )}
                  strokeWidth={1.75}
                />
                <span className="flex-1">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label={open ? 'Cerrar navegación' : 'Abrir navegación'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="fixed left-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-paper text-carbon outline-none focus-visible:ring-2 focus-visible:ring-electric md:hidden"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      {open && (
        <button
          type="button"
          aria-label="Cerrar navegación"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-carbon/40 md:hidden"
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex h-dvh w-[248px] shrink-0 flex-col bg-carbon text-canvas transition-transform md:static md:h-screen md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-20 items-center px-6">
          <Wordmark tone="dark" subtitle={user.workspace.name} />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
          <NavSection label="Principal" first />
          {renderItems(navItems.slice(0, 14), true)}
          <NavSection label="Sistema" />
          {renderItems(navItems.slice(14), false)}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3 rounded-lg p-2">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-canvas text-xs font-bold text-carbon">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-canvas">{user.name}</p>
              <p className="truncate text-[11px] text-fog">{user.email}</p>
            </div>
            <span className="rounded-full bg-lime px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-carbon">
              {user.role}
            </span>
          </div>
          <LogoutForm />
        </div>
      </aside>
    </>
  );
}
