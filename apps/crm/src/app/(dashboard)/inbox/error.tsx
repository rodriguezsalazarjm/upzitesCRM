'use client';

import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Error del segmento Inbox. No muestra el detalle técnico: el usuario solo
 * necesita saber que no cargó y poder reintentar.
 */
export default function InboxError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-tomato/12 text-danger-ink">
          <TriangleAlert className="h-6 w-6" strokeWidth={1.5} aria-hidden />
        </span>
        <p className="text-base font-bold text-carbon">No pudimos cargar tu bandeja</p>
        <p className="mt-1 text-sm text-ash">
          Puede ser un corte de conexión. Tus mensajes y borradores están a salvo.
        </p>
        <Button className="mt-5" onClick={() => reset()}>
          Reintentar
        </Button>
      </div>
    </div>
  );
}
