'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Mail, RefreshCw } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type Mailbox = { id: string; label: string; slug: string; emailAddress: string; status: string; lastSyncedAt: string | null; lastError: string | null };
type Provider = { provider: string; label: string; slug: string; available: boolean; missing: string };

export function MailboxBar({ mailboxes, providers }: { mailboxes: Mailbox[]; providers: Provider[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function call(url: string, method: string) {
    setBusy(true);
    setError('');
    const response = await fetch(url, { method }).catch(() => null);
    const json = (await response?.json().catch(() => null)) as { data?: { errors?: string[] }; message?: string } | null;
    setBusy(false);
    if (!response?.ok) setError(json?.message ?? 'No se pudo completar.');
    else if (json?.data?.errors?.length) setError(json.data.errors[0]);
    router.refresh();
  }

  const connect = (
    <div className="flex flex-wrap gap-2">
      {providers.map((p) => p.available
        ? <a key={p.slug} href={`/api/mail/oauth/${p.slug}/connect`} className={buttonVariants({ variant: mailboxes.length ? 'ghost' : 'default', size: 'sm' })} data-connect={p.slug}><Mail aria-hidden /> Conectar {p.label}</a>
        : <span key={p.slug} className="text-xs text-soft" title={`Falta configurar ${p.missing}`}>{p.label}: no disponible en este servidor</span>)}
    </div>
  );

  if (!mailboxes.length) {
    return (
      <Card className="space-y-3 p-4" data-mail-empty>
        <p className="text-sm font-semibold text-carbon">Conecta tu correo para leer y responder desde Upzites Flow</p>
        <p className="text-sm text-graphite">Es tu buzón personal: solo tú lo ves. Entramos con el permiso de Google o Microsoft (nunca pedimos tu contraseña) y puedes desconectarlo cuando quieras. Los emails automáticos del negocio siguen saliendo por separado.</p>
        {connect}
      </Card>
    );
  }
  return (
    <div className="space-y-2" data-mailboxes>
      {mailboxes.map((m) => (
        <div key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-graphite" data-mailbox={m.emailAddress}>
          <span className="font-semibold text-carbon">{m.emailAddress}</span>
          <span>{m.label}</span>
          {m.status === 'CONNECTED'
            ? <span>{m.lastSyncedAt ? `actualizado ${new Date(m.lastSyncedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : 'sin sincronizar'}</span>
            : <span className="text-danger-ink">{m.lastError ?? 'Desconectado'} <a href={`/api/mail/oauth/${m.slug}/connect`} className="font-semibold underline">Reconectar</a></span>}
          <button type="button" className="font-semibold text-danger-ink hover:underline" disabled={busy} onClick={() => { if (confirm(`¿Desconectar ${m.emailAddress}? Se borran de Upzites los correos importados (en tu buzón no cambia nada).`)) void call(`/api/mail/accounts/${m.id}`, 'DELETE'); }}>Desconectar</button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void call('/api/mail/sync', 'POST')} data-mail-sync><RefreshCw aria-hidden className={busy ? 'animate-spin' : ''} /> Actualizar</Button>
        {connect}
      </div>
      {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
    </div>
  );
}
