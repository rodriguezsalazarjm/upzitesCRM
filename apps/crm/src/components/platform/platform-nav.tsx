'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, Building2, CreditCard, Gauge, History, KeyRound, Mail, ShieldCheck, Tags, Users } from 'lucide-react';
import { Wordmark } from '@/components/ui/wordmark';
import { cn } from '@/lib/utils';

const items = [
  { href: '/platform', label: 'Resumen', icon: Gauge, exact: true },
  { href: '/platform/clients', label: 'Clientes SaaS', icon: Users },
  { href: '/platform/workspaces', label: 'Workspaces', icon: Building2 },
  { href: '/platform/invitations', label: 'Invitaciones', icon: Mail },
  { href: '/platform/billing', label: 'Billing SaaS', icon: CreditCard },
  { href: '/platform/prices', label: 'Price Book', icon: Tags, superOnly: true },
  { href: '/platform/roles', label: 'Roles plataforma', icon: KeyRound, superOnly: true },
  { href: '/platform/audit', label: 'Auditoría', icon: History },
  { href: '/ops', label: 'Ops', icon: ShieldCheck },
];

export function PlatformNav({ superAdmin, operator }: { superAdmin: boolean; operator: { name: string; role: string } }) {
  const pathname = usePathname();
  return (
    <aside className="flex w-full shrink-0 flex-col bg-carbon text-canvas md:h-dvh md:w-[232px]">
      <div className="flex h-16 items-center px-5 md:h-20">
        <Wordmark tone="dark" subtitle="Platform Admin" />
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-y-auto">
        {items
          .filter((item) => !item.superOnly || superAdmin)
          .map((item) => {
            const Icon = item.icon;
            const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-canvas text-carbon' : 'text-mist hover:bg-white/[0.07] hover:text-white',
                )}
              >
                <Icon className={cn('h-4 w-4', active ? 'text-electric' : 'text-fog')} strokeWidth={1.75} />
                {item.label}
              </Link>
            );
          })}
      </nav>
      <div className="hidden border-t border-white/10 p-4 md:block">
        <p className="truncate text-[13px] font-semibold">{operator.name}</p>
        <p className="text-[11px] uppercase tracking-[0.12em] text-lime">{operator.role}</p>
        <Link href="/dashboard" className="mt-3 flex items-center gap-2 text-xs text-fog hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a mis negocios
        </Link>
      </div>
    </aside>
  );
}
