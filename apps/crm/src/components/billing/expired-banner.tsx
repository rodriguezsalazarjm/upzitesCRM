import Link from 'next/link';
import { Info } from 'lucide-react';

/**
 * Plan vencido (P0-B): el workspace sigue funcionando con los limites de FREE.
 * No se borro nada; renovar devuelve el plan contratado.
 */
export function ExpiredBanner({ planName }: { planName: string | null }) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-ivory px-4 py-2 text-xs text-carbon md:px-6"
    >
      <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <p className="flex-1">
        {planName ? `Tu plan ${planName} venció.` : 'Tu plan venció.'} Mientras tanto trabajas con los límites de Free;
        tus datos siguen intactos.
      </p>
      <Link href="/billing" className="font-semibold underline underline-offset-2">
        Renovar
      </Link>
    </div>
  );
}
