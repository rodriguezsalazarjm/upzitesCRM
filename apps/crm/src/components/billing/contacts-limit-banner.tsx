import Link from 'next/link';
import { Users } from 'lucide-react';

/**
 * Contactos en el limite del plan (P0-C). Persistente en todo el dashboard
 * mientras dure: los contactos que ENTRAN (WhatsApp, Instagram/Messenger,
 * formularios) se siguen guardando, pero crear o importar nuevos queda
 * bloqueado. No se borra nada.
 */
export function ContactsLimitBanner({ usage, limit }: { usage: number; limit: number }) {
  const over = usage > limit;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-solar/20 px-4 py-2 text-xs text-warning-ink md:px-6"
    >
      <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <p className="flex-1">
        {over
          ? `Tienes ${usage.toLocaleString('es-CL')} contactos y tu plan incluye ${limit.toLocaleString('es-CL')}.`
          : `Llegaste al límite de ${limit.toLocaleString('es-CL')} contactos de tu plan.`}{' '}
        Los contactos entrantes se siguen guardando, pero no puedes crear ni importar nuevos: libera contactos o mejora
        tu plan.
      </p>
      <Link href="/billing" className="font-semibold underline underline-offset-2">
        Mejorar plan
      </Link>
    </div>
  );
}
