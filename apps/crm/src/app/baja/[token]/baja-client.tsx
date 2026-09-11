'use client';

import { useState } from 'react';

/**
 * Confirmacion de la baja.
 *
 * Un solo boton y ninguna pregunta previa: pedir un motivo antes de dejar de
 * escribir es exactamente lo que hace que la gente marque el correo como spam
 * en lugar de darse de baja, y una queja de spam pesa mucho mas.
 */
export function BajaClient({
  token,
  email,
  alreadyUnsubscribed,
}: {
  token: string;
  email: string;
  alreadyUnsubscribed: boolean;
}) {
  const [done, setDone] = useState(alreadyUnsubscribed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    setBusy(true);

    const response = await fetch('/api/email/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    setBusy(false);

    if (!response.ok) {
      setError('No pudimos procesar la baja. Intentalo de nuevo en un momento.');
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <>
        <h1 className="text-lg font-semibold text-slate-900">Listo, no te escribimos mas</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sacamos <span className="font-medium text-slate-800">{email}</span> de nuestros envios
          comerciales. Si tienes una compra en curso, seguiras recibiendo solo los avisos de esa
          compra.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-lg font-semibold text-slate-900">Cancelar suscripcion</h1>
      <p className="mt-2 text-sm text-slate-600">
        Vamos a dejar de enviar correos comerciales a{' '}
        <span className="font-medium text-slate-800">{email}</span>.
      </p>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <button
        type="button"
        onClick={confirm}
        disabled={busy}
        className="mt-6 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {busy ? 'Procesando…' : 'Confirmar baja'}
      </button>
    </>
  );
}
