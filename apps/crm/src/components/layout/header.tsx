'use client';

import Link from 'next/link';
import { Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { PushNotificationsButton } from '@/components/pwa/push-notifications-button';

interface HeaderProps {
  title: string;
  subtitle?: string;
  action?: { label: string; href?: string };
}

/** Cabecera estándar de página: PageHeader + búsqueda global, notificaciones y acción principal. */
export function Header({ title, subtitle, action }: HeaderProps) {
  return (
    <PageHeader
      title={title}
      description={subtitle}
      actions={
        <>
          <div className="relative hidden md:block">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-stone" strokeWidth={1.75} />
            <Input placeholder="Buscar..." aria-label="Buscar" className="h-10 w-60 rounded-full pl-10 text-[13px]" />
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
        </>
      }
    />
  );
}
