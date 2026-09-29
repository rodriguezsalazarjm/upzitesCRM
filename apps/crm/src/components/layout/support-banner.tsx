'use client';

import { ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Aviso permanente de modo soporte: un operador de plataforma esta dentro de
 * un workspace del que no es miembro. READ_ONLY por defecto; escribir exige
 * elevar con un motivo, y todo queda auditado.
 */
export function SupportBanner({
  workspaceName,
  mode,
  expiresAt,
}: {
  workspaceName: string;
  mode: 'READ_ONLY' | 'READ_WRITE';
  expiresAt: string;
}) {
  const [elevating, setElevating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const until = new Date(expiresAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  // Cuenta regresiva en vivo: al llegar a cero el servidor ya no acepta la
  // sesion y el proximo request vuelve al workspace propio.
  // null hasta montar: el servidor y el cliente no comparten reloj (evita el
  // desajuste de hidratacion); mientras tanto se muestra la hora de termino.
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const ms = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      setLeft(ms);
      if (ms === 0) window.location.reload();
    };
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [expiresAt]);
  const countdown =
    left === null
      ? until
      : `${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;

  async function elevate() {
    const reason = window.prompt('Motivo para habilitar escritura (queda auditado):')?.trim();
    if (!reason) return;
    setElevating(true);
    setError(null);
    const response = await fetch('/api/platform/support-sessions/elevate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!response.ok) {
      setElevating(false);
      setError('No se pudo habilitar la escritura.');
      return;
    }
    window.location.reload();
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-carbon px-4 py-2 text-xs text-canvas md:px-6"
    >
      <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-lime" aria-hidden />
      <p className="flex-1">
        Modo soporte en <strong>{workspaceName}</strong> ·{' '}
        {mode === 'READ_ONLY' ? 'solo lectura' : 'escritura habilitada (auditada)'} · quedan{' '}
        <span className="font-mono tabular-nums" aria-label={`Termina a las ${until}`}>{countdown}</span>
      </p>
      {error && <span role="alert">{error}</span>}
      {mode === 'READ_ONLY' && (
        <button type="button" onClick={elevate} disabled={elevating} className="font-semibold underline underline-offset-2">
          {elevating ? 'Habilitando…' : 'Habilitar escritura'}
        </button>
      )}
      <form action="/api/platform/support-sessions/end" method="post">
        <button type="submit" className="font-semibold underline underline-offset-2">
          Salir de soporte
        </button>
      </form>
    </div>
  );
}
