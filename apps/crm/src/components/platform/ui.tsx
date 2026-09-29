import { StatusBadge, type StatusTone } from '@/components/ui/status-badge';
import type { SubscriptionState } from '@/lib/billing/subscription-state';

/** Piezas de presentacion compartidas por las paginas de /platform. */

export function PlatformPage({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="type-display text-[34px] leading-[0.95] text-carbon sm:text-[40px]">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-ash">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </div>
  );
}

export function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-paper p-5">
      <h2 className="text-sm font-semibold text-carbon">{title}</h2>
      {description && <p className="mt-1 text-xs text-soft">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const STATE_TONE: Record<SubscriptionState, StatusTone> = {
  FREE: 'neutral',
  TRIAL: 'info',
  ACTIVE: 'success',
  GRACE: 'warning',
  SUSPENDED: 'danger',
  EXPIRED: 'draft',
};

export function StateBadge({ state }: { state: SubscriptionState }) {
  return <StatusBadge tone={STATE_TONE[state]}>{state}</StatusBadge>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-mist px-4 py-6 text-center text-sm text-soft">{children}</p>;
}

export function DataTable({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-[11px] uppercase tracking-[0.1em] text-soft">
            {head.map((h) => (
              <th key={h} className="py-2 pr-4 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export const fmtDate = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
