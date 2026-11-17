'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type EmailDomainView = {
  id: string; domain: string; status: string; fromEmail: string | null; fromName: string | null;
  dnsRecords: { type: string; name: string; value: string; priority?: number }[]; lastError: string | null; lastCheckedAt: string | null;
};

const STATUS: Record<string, [string, string]> = {
  VERIFIED: ['Verificado', 'text-success-ink'],
  PENDING: ['Pendiente de DNS', 'text-warning-ink'],
  FAILED: ['Falló', 'text-danger-ink'],
};

/** P25: el negocio registra su dominio de envío, publica los DNS y lo verifica, sin tocar la API. */
export function EmailDomainsCard({ domains, canManage }: { domains: EmailDomainView[]; canManage: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({ domain: '', fromName: '', fromEmail: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function call(key: string, url: string, body?: unknown) {
    setBusy(key);
    setError('');
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    const json = (await response?.json().catch(() => null)) as { message?: string } | null;
    setBusy(null);
    if (!response?.ok) return setError(json?.message ?? 'No se pudo completar.');
    if (key === 'add') setForm({ domain: '', fromName: '', fromEmail: '' });
    router.refresh();
  }

  return (
    <div className="space-y-4" data-email-domains>
      <p className="text-sm text-graphite">Las entregas digitales, recibos y campañas salen desde tu dominio. Hasta que esté verificado, el email promocional no se envía.</p>
      {domains.map((d) => {
        const [label, tone] = STATUS[d.status] ?? [d.status, 'text-graphite'];
        return (
          <div key={d.id} className="space-y-2 rounded-xl border border-line p-3" data-domain={d.domain} data-status={d.status}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-carbon">{d.domain}</span>
              <span className={`text-xs font-semibold ${tone}`}>{label}</span>
              <span className="text-xs text-soft">{d.fromName ? `${d.fromName} · ` : ''}{d.fromEmail ?? `no-reply@${d.domain}`}</span>
              {canManage && d.status !== 'VERIFIED' && (
                <Button type="button" size="sm" variant="outline" className="ml-auto" disabled={busy !== null} onClick={() => void call(d.id, `/api/email/domains/${d.id}/verify`)} data-verify>
                  {busy === d.id ? 'Verificando…' : 'Verificar ahora'}
                </Button>
              )}
            </div>
            {d.lastError && <p className="text-xs text-danger-ink">{d.lastError}</p>}
            {d.status !== 'VERIFIED' && d.dnsRecords.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-graphite">Publica estos registros en el DNS de tu dominio (puede tardar hasta unas horas en propagarse):</p>
                <ul className="space-y-1 text-xs">
                  {d.dnsRecords.map((r, i) => (
                    <li key={i} className="rounded-lg bg-ivory p-2 font-mono">
                      <span className="font-semibold">{r.type}</span>{r.priority !== undefined ? ` (${r.priority})` : ''} · <span className="break-all">{r.name}</span>
                      <span className="block break-all text-graphite">{r.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
      {canManage ? (
        <form className="grid gap-2 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); void call('add', '/api/email/domains', { domain: form.domain.trim(), fromName: form.fromName.trim() || undefined, fromEmail: form.fromEmail.trim() || undefined }); }}>
          <Input aria-label="Dominio" placeholder="mail.tunegocio.cl" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} required data-domain-input />
          <Input aria-label="Nombre remitente" placeholder="Nombre remitente (opcional)" value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} />
          <Input aria-label="Email remitente" type="email" placeholder="hola@mail.tunegocio.cl (opcional)" value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} />
          <div className="sm:col-span-3"><Button type="submit" size="sm" disabled={busy !== null} data-add-domain>{busy === 'add' ? 'Agregando…' : 'Agregar dominio'}</Button></div>
        </form>
      ) : <p className="text-xs text-soft">Solo el owner o un admin puede configurar el dominio.</p>}
      {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
    </div>
  );
}
