'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Ban, Copy, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

type Message = { kind: 'error' | 'success' | 'warning'; text: string } | null;

/**
 * Acciones de la entrega de un pedido (OWNER/ADMIN): reenviar (mismo enlace,
 * nuevo intento por los canales existentes), copiar el enlace para mandarlo a
 * mano y revocar el acceso.
 */
export function DeliveryActions({ orderId, deliveryId, url, revoked }: { orderId: string; deliveryId: string; url: string | null; revoked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<'resend' | 'revoke' | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function post(action: 'resend' | 'revoke') {
    setBusy(action);
    setMessage(null);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryId }),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string; data?: { status?: string; notified?: boolean; emailSimulated?: boolean; error?: string | null } };
      if (!response.ok) {
        setMessage({ kind: 'error', text: body.message ?? 'No pudimos completar la acción.' });
        return;
      }
      if (action === 'revoke') {
        setMessage({ kind: 'success', text: 'Acceso revocado. El enlace ya no muestra el contenido.' });
        setConfirm(false);
      } else if (body.data?.status === 'SENT') {
        setMessage({ kind: 'success', text: body.data.emailSimulated ? 'Reenviada por email simulado (entorno de prueba: no llega a un buzón real).' : 'Entrega reenviada al cliente.' });
      } else {
        setMessage({ kind: 'warning', text: `${body.data?.error ?? 'No se pudo enviar automáticamente.'} Copia el enlace y envíalo a mano.` });
      }
      router.refresh();
    } catch {
      setMessage({ kind: 'error', text: 'No pudimos conectar con el servidor.' });
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setMessage({ kind: 'success', text: 'Enlace copiado.' });
    } catch {
      setMessage({ kind: 'error', text: 'No se pudo copiar. Selecciona el enlace y cópialo a mano.' });
    }
  }

  if (revoked) return <p className="text-xs text-soft">El acceso está revocado: no se puede reenviar.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => post('resend')} disabled={busy !== null}>
          {busy === 'resend' ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
          Reenviar entrega
        </Button>
        {url && (
          <Button type="button" size="sm" variant="outline" onClick={copy} disabled={busy !== null}>
            <Copy aria-hidden />
            Copiar enlace
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" className="text-danger-ink" onClick={() => setConfirm(true)} disabled={busy !== null}>
          <Ban aria-hidden />
          Revocar acceso
        </Button>
      </div>
      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`rounded-lg px-3 py-2 text-xs ${message.kind === 'error' ? 'bg-tomato/12 text-danger-ink' : message.kind === 'warning' ? 'bg-solar/30 text-warning-ink' : 'bg-lime/25 text-success-ink'}`}
        >
          {message.text}
        </p>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="¿Revocar el acceso a esta entrega?"
        description="El enlace del comprador dejará de mostrar el contenido y no se generarán descargas nuevas. Lo que ya descargó no se puede borrar de su equipo. No se puede deshacer."
        confirmLabel="Revocar acceso"
        destructive
        busy={busy === 'revoke'}
        onConfirm={() => post('revoke')}
      />
    </div>
  );
}
