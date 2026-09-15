'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Banknote, CheckCircle2, CircleAlert, Loader2, Unplug } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type Connection = {
  mode: 'TEST' | 'PRODUCTION';
  publicKey: string | null;
  status: 'CONNECTED' | 'DISCONNECTED' | 'NEEDS_ATTENTION';
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
  saved: true;
};

type StatusResponse = {
  data: Connection | null;
  canManage: boolean;
  encryptionConfigured: boolean;
};

type ConnectForm = {
  accessToken: string;
  webhookSecret: string;
  publicKey: string;
  mode: 'TEST' | 'PRODUCTION';
};

const emptyForm: ConnectForm = { accessToken: '', webhookSecret: '', publicKey: '', mode: 'TEST' };

function date(value: string | null) {
  return value ? new Date(value).toLocaleString('es-CL') : null;
}

/**
 * Conecta la cuenta de Mercado Pago DEL WORKSPACE: la que cobra sus propios
 * productos (infoproductos, servicios). Distinta de la cuenta con la que
 * Upzites cobra la suscripcion del CRM, que no se configura aqui.
 */
export function MercadoPagoIntegrationCard() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [form, setForm] = useState<ConnectForm>(emptyForm);
  const [busy, setBusy] = useState<string | null>('load');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch('/api/integrations/mercado-pago/status', { cache: 'no-store' });
    const data = (await response.json().catch(() => ({}))) as StatusResponse & { message?: string };
    if (!response.ok) throw new Error(data.message ?? 'No se pudo consultar Mercado Pago.');
    setStatus(data);
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/integrations/mercado-pago/status', { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as StatusResponse & {
          message?: string;
        };
        if (!response.ok) throw new Error(data.message ?? 'No se pudo consultar Mercado Pago.');
        return data;
      })
      .then((data) => {
        if (active) setStatus(data);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Error desconocido.');
      })
      .finally(() => {
        if (active) setBusy(null);
      });
    return () => {
      active = false;
    };
  }, [load]);

  async function connect(event: FormEvent) {
    event.preventDefault();
    setBusy('connect');
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/integrations/mercado-pago/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: form.accessToken.trim(),
          webhookSecret: form.webhookSecret.trim(),
          publicKey: form.publicKey.trim() || undefined,
          mode: form.mode,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(data.message ?? 'No se pudo conectar Mercado Pago.');
      setForm(emptyForm);
      setNotice('Cuenta de Mercado Pago conectada.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Error desconocido.');
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    setBusy('disconnect');
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/integrations/mercado-pago/disconnect', { method: 'POST' });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(data.message ?? 'No se pudo desconectar.');
      setNotice('Cuenta de Mercado Pago desconectada.');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Error desconocido.');
    } finally {
      setBusy(null);
    }
  }

  const connection = status?.data ?? null;
  const connected = connection?.status === 'CONNECTED';

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Banknote className="h-4 w-4 text-slate-500" />
            Mercado Pago
          </CardTitle>
          {status && (
            <Badge variant={connected ? 'success' : connection?.status === 'NEEDS_ATTENTION' ? 'warning' : 'outline'}>
              {connected ? 'Conectado' : connection?.status === 'NEEDS_ATTENTION' ? 'Requiere atencion' : 'No conectado'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-xs text-slate-500">
        <p>Cobra los productos y servicios propios de este workspace. No afecta la suscripcion del CRM.</p>

        {busy === 'load' && !status ? (
          <p className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
          </p>
        ) : connected ? (
          <div className="space-y-2">
            <p>
              Modo: <span className="font-semibold text-slate-700">{connection?.mode === 'PRODUCTION' ? 'Produccion' : 'Prueba'}</span>
            </p>
            <p>Conectado: {date(connection?.connectedAt ?? null) ?? '—'}</p>
            <p>Ultima verificacion: {date(connection?.lastVerifiedAt ?? null) ?? '—'}</p>
            {connection?.lastError && (
              <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-amber-800">
                <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {connection.lastError}
              </p>
            )}
            {status?.canManage && (
              <Button size="sm" variant="outline" disabled={busy === 'disconnect'} onClick={disconnect}>
                {busy === 'disconnect' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                Desconectar
              </Button>
            )}
          </div>
        ) : status?.canManage ? (
          <form onSubmit={connect} className="space-y-2">
            <label className="block text-xs font-medium text-slate-700">
              Access Token
              <Input
                value={form.accessToken}
                onChange={(e) => setForm((f) => ({ ...f, accessToken: e.target.value }))}
                placeholder="APP_USR-... o TEST-..."
                disabled={busy === 'connect'}
                required
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Secreto de webhook
              <Input
                value={form.webhookSecret}
                onChange={(e) => setForm((f) => ({ ...f, webhookSecret: e.target.value }))}
                placeholder="Developers → Webhooks → Firma secreta"
                disabled={busy === 'connect'}
                required
              />
            </label>
            <label className="block text-xs font-medium text-slate-700">
              Public Key (opcional)
              <Input
                value={form.publicKey}
                onChange={(e) => setForm((f) => ({ ...f, publicKey: e.target.value }))}
                disabled={busy === 'connect'}
              />
            </label>
            <fieldset className="flex gap-3 text-xs text-slate-700">
              {(['TEST', 'PRODUCTION'] as const).map((mode) => (
                <label key={mode} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={form.mode === mode}
                    onChange={() => setForm((f) => ({ ...f, mode }))}
                    disabled={busy === 'connect'}
                  />
                  {mode === 'TEST' ? 'Prueba' : 'Produccion'}
                </label>
              ))}
            </fieldset>
            <Button type="submit" size="sm" disabled={busy === 'connect'}>
              {busy === 'connect' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Conectar
            </Button>
          </form>
        ) : (
          <p>Solo el owner o un admin puede conectar Mercado Pago.</p>
        )}

        {error && <p className="rounded-lg bg-red-50 px-2 py-1.5 text-red-700">{error}</p>}
        {notice && (
          <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1.5 text-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5" /> {notice}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
