import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

/**
 * Aviso de periodo de gracia: el pago vencio pero el workspace conserva todo
 * durante unos dias. Se muestra en todas las pantallas para que renovar no
 * dependa de que alguien entre justo a Billing.
 */
export function GraceBanner({ graceEndsAt }: { graceEndsAt: string }) {
  const date = new Date(graceEndsAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' });

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-solar/30 px-4 py-2 text-xs text-warning-ink md:px-6"
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <p className="flex-1">
        Tu suscripción venció. Mantienes el acceso completo hasta el <strong>{date}</strong>.
      </p>
      <Link href="/billing" className="font-semibold underline underline-offset-2">
        Renovar ahora
      </Link>
    </div>
  );
}
