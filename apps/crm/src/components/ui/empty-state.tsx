import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';

/** Estado vacío: icono fino, mensaje corto y directo, acción opcional. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ivory text-ash">
        <Icon className="h-5 w-5" strokeWidth={1.5} />
      </span>
      <p className="text-base font-bold text-carbon">{title}</p>
      {description && <p className="max-w-sm text-sm text-ash">{description}</p>}
      {action}
    </Card>
  );
}
