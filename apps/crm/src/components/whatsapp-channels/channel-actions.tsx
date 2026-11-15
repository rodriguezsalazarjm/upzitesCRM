'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, Unplug, Webhook } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

async function post(url: string, body?: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, data };
}

const when = (value: string | null) => (value ? new Date(value).toLocaleString('es-CL') : 'nunca');

/** Verificar / reconectar, probar webhook y desconectar un numero. */
export function ChannelActions({ id, disconnected, hasToken }: { id: string; disconnected: boolean; hasToken: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const base = `/api/integrations/whatsapp/channels/${id}`;

  async function run(action: 'verify' | 'test-webhook' | 'disconnect') {
    setBusy(action);
    setResult(null);
    const response = await post(`${base}/${action}`);
    setBusy(null);
    setConfirm(false);
    if (!response.ok) {
      setResult({ ok: false, text: response.data.message ?? 'Meta no respondió como se esperaba.' });
    } else if (action === 'test-webhook') {
      const data = response.data.data as { subscribed: boolean; lastWebhookAt: string | null; verifyTokenConfigured: boolean; appSecretConfigured: boolean };
      const env = !data.verifyTokenConfigured || !data.appSecretConfigured ? ' Falta configurar el token de verificación o el secreto de la app en el servidor.' : '';
      setResult({
        ok: data.subscribed,
        text: `${data.subscribed ? 'Meta confirma la app suscrita a esta cuenta.' : 'Meta no muestra la app suscrita a esta cuenta: reconecta el número.'} Último evento recibido: ${when(data.lastWebhookAt)}.${env}`,
      });
    } else {
      setResult({ ok: true, text: action === 'verify' ? 'Meta confirmó el número.' : 'Número desconectado.' });
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {hasToken && (
          <Button size="sm" variant="outline" onClick={() => run('verify')} disabled={busy !== null}>
            {busy === 'verify' ? <Loader2 className="animate-spin" /> : <RefreshCw strokeWidth={1.75} />} {disconnected ? 'Reconectar' : 'Verificar con Meta'}
          </Button>
        )}
        {!disconnected && hasToken && (
          <Button size="sm" variant="outline" onClick={() => run('test-webhook')} disabled={busy !== null}>
            {busy === 'test-webhook' ? <Loader2 className="animate-spin" /> : <Webhook strokeWidth={1.75} />} Probar webhook
          </Button>
        )}
        {!disconnected && (
          <Button size="sm" variant="ghost" onClick={() => setConfirm(true)} disabled={busy !== null}>
            <Unplug strokeWidth={1.75} /> Desconectar
          </Button>
        )}
      </div>
      {disconnected && !hasToken && (
        <p className="text-[11px] text-soft">Para reconectar, vuelve a autorizar el número desde “Agregar número”: conserva su configuración e historial.</p>
      )}
      {result && <p className={`text-xs ${result.ok ? 'text-success-ink' : 'text-danger-ink'}`} role={result.ok ? undefined : 'alert'}>{result.text}</p>}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="¿Desconectar este número?"
        description="Se borra la credencial y deja de recibir y enviar mensajes por aquí. Las conversaciones y la configuración se conservan para cuando lo reconectes."
        confirmLabel="Desconectar"
        destructive
        busy={busy === 'disconnect'}
        onConfirm={() => run('disconnect')}
      />
    </div>
  );
}
