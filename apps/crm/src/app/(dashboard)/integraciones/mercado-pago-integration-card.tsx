'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Banknote, CheckCircle2, CircleAlert, ExternalLink, Loader2, RefreshCw, Unplug } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type ConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'NEEDS_ATTENTION' | 'REAUTH_REQUIRED';

type Connection = {
  connectionMethod: 'OAUTH' | 'MANUAL';
  mode: 'TEST' | 'PRODUCTION';
  mercadoPagoUserId: string | null;
  publicKey: string | null;
  status: ConnectionStatus;
  connectedAt: string | null;
  lastRefreshAt: string | null;
  lastVerifiedAt: string | null;
  lastErrorCode: string | null;
  lastError: string | null;
  saved: true;
};

type StatusResponse = {
  data: Connection | null;
  canManage: boolean;
  encryptionConfigured: boolean;
  oauthConfigured: boolean;
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

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  CONNECTED: 'Conectado',
  DISCONNECTED: 'No conectado',
  NEEDS_ATTENTION: 'Requiere atencion',
  REAUTH_REQUIRED: 'Reconexion necesaria',
};

const STATUS_VARIANT: Record<ConnectionStatus, 'success' | 'warning' | 'outline'> = {
  CONNECTED: 'success',
  DISCONNECTED: 'outline',
  NEEDS_ATTENTION: 'warning',
  REAUTH_REQUIRED: 'warning',
};

/**
 * Conecta la cuenta de Mercado Pago DEL WORKSPACE: la que cobra sus propios
 * productos (infoproductos, servicios). Distinta de la cuenta con la que
 * Upzites cobra la suscripcion del CRM, que no se configura aqui.
 *
 * OAuth es la experiencia principal (el vendedor autoriza la aplicacion de
 * Mercado Pago de Upzites Flow, sin copiar ningun token). Conectar
 * manualmente sigue disponible como modo avanzado/legacy, colapsado.
 */
export function MercadoPagoIntegrationCard() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [form, setForm] = useState<ConnectForm>(emptyForm);
  const [showManual, setShowManual] = useState(false);
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

  // Vuelve a leer el estado si el callback de OAuth redirigio de aca con un
  // resultado (?mercado_pago=conectado|error), para no dejar la tarjeta con
  // el estado viejo hasta el proximo refresh manual.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('mercado_pago');
    if (!result) return;
    queueMicrotask(() => {
      if (result === 'conectado') setNotice('Cuenta de Mercado Pago conectada.');
      if (result === 'error') setError('No se pudo completar la conexion con Mercado Pago.');
    });
    fetch('/api/integrations/mercado-pago/status', { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as StatusResponse & {
          message?: string;
        };
        if (!response.ok) throw new Error(data.message ?? 'No se pudo consultar Mercado Pago.');
        return data;
      })
      .then((data) => setStatus(data))
      .catch(() => undefined);
    params.delete('mercado_pago');
    const query = params.toString();
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
  }, []);

  async function connectManual(event: FormEvent) {
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
      setShowManual(false);
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
  const needsReauth = connection?.status === 'REAUTH_REQUIRED';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Banknote className="h-4 w-4 text-slate-500" />
            Mercado Pago
          </CardTitle>
          {status && connection && (
            <Badge variant={STATUS_VARIANT[connection.status]}>{STATUS_LABEL[connection.status]}</Badge>
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
              Conexion:{' '}
              <span className="font-semibold text-slate-700">
                {connection?.connectionMethod === 'OAUTH' ? 'Mercado Pago Connect (OAuth)' : 'Manual'}
              </span>
            </p>
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
        ) : needsReauth ? (
          <div className="space-y-2">
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-amber-800">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {connection?.lastError ?? 'La autorizacion vencio o fue revocada.'}
            </p>
            {status?.canManage && (
              <Button size="sm" onClick={() => window.location.assign('/api/integrations/mercado-pago/oauth/connect')}>
                <RefreshCw className="h-3.5 w-3.5" />
                Reconectar Mercado Pago
              </Button>
            )}
          </div>
        ) : status?.canManage ? (
          <div className="space-y-3">
            {status.oauthConfigured ? (
              <Button size="sm" onClick={() => window.location.assign('/api/integrations/mercado-pago/oauth/connect')}>
                <ExternalLink className="h-3.5 w-3.5" />
                Conectar Mercado Pago
              </Button>
            ) : (
              <p className="rounded-lg bg-slate-50 px-2 py-1.5">
                La conexion con un clic todavia no esta configurada en esta instalacion (faltan las
                credenciales de la aplicacion). Usa la opcion manual mientras tanto.
              </p>
            )}

            <button
              type="button"
              className="text-[11px] font-medium text-slate-500 underline-offset-2 hover:underline"
              onClick={() => setShowManual((value) => !value)}
            >
              {showManual ? 'Ocultar conexion manual' : 'Conectar manualmente (avanzado)'}
            </button>

            {showManual && (
              <form onSubmit={connectManual} className="space-y-2 rounded-lg border border-slate-200 p-3">
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
            )}
          </div>
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
