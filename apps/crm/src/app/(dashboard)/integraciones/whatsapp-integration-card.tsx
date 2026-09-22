'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, Loader2, MessageCircle, RefreshCw, Unplug } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type Channel = {
  id: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  businessName: string | null;
  status: 'PENDING' | 'CONNECTED' | 'DISCONNECTED' | 'NEEDS_ATTENTION';
  qualityRating: string | null;
  lastHealthCheckAt: string | null;
  webhookSubscribedAt: string | null;
  lastInboundAt: string | null;
  saved: boolean;
  hasToken: boolean;
  credentialsVerified: boolean;
  webhookSubscribed: boolean;
};

type StatusResponse = {
  data: Channel[];
  canManage: boolean;
  encryptionConfigured: boolean;
  verifyTokenConfigured: boolean;
  appSecretConfigured: boolean;
};

const emptyForm = {
  wabaId: '',
  phoneNumberId: '',
  displayPhoneNumber: '',
  businessName: '',
  accessToken: '',
};

function date(value: string | null) {
  return value ? new Date(value).toLocaleString('es-CL') : null;
}

const WHATSAPP_STATUS_LABEL = {
  PENDING: 'Pendiente',
  CONNECTED: 'Conectado',
  DISCONNECTED: 'No conectado',
  NEEDS_ATTENTION: 'Requiere atención',
} as const;

function Fact({ done, title, detail }: { done: boolean; title: string; detail: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
      {done ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      )}
      <div>
        <p className="text-xs font-semibold text-slate-800">{title}</p>
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

export function WhatsAppIntegrationCard() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState<string | null>('load');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch('/api/integrations/whatsapp/status', { cache: 'no-store' });
    const data = (await response.json().catch(() => ({}))) as StatusResponse & { message?: string };
    if (!response.ok) throw new Error(data.message ?? 'No se pudo consultar WhatsApp.');
    setStatus(data);
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/integrations/whatsapp/status', { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as StatusResponse & {
          message?: string;
        };
        if (!response.ok) throw new Error(data.message ?? 'No se pudo consultar WhatsApp.');
        return data;
      })
      .then((data) => {
        if (active) setStatus(data);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'No se pudo cargar.');
      })
      .finally(() => {
        if (active) setBusy(null);
      });
    return () => {
      active = false;
    };
  }, []);

  async function action(path: string, body: unknown, key: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(data.message ?? 'No se pudo completar la accion.');
      await load();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo completar la accion.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function connect(event: FormEvent) {
    event.preventDefault();
    const ok = await action('/api/integrations/whatsapp/connect', form, 'connect');
    if (ok) {
      setForm(emptyForm);
      setNotice('Meta valido el numero, la WABA y la suscripcion del webhook.');
    }
  }

  function edit(channel: Channel) {
    setForm({
      wabaId: channel.wabaId,
      phoneNumberId: channel.phoneNumberId,
      displayPhoneNumber: channel.displayPhoneNumber,
      businessName: channel.businessName ?? '',
      accessToken: '',
    });
    setNotice('Ingresa el token nuevo para reemplazar la credencial cifrada.');
  }

  const configured =
    status?.encryptionConfigured && status.verifyTokenConfigured && status.appSecretConfigured;
  const operational = status?.data.some(
    (channel) =>
      channel.status === 'CONNECTED' && channel.credentialsVerified && channel.webhookSubscribed,
  );

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-emerald-600" />
            <CardTitle>WhatsApp Business</CardTitle>
          </div>
          <Badge variant={operational ? 'success' : status?.data.length ? 'warning' : 'outline'}>
            {operational
              ? 'Verificado'
              : status?.data.length
                ? 'Requiere verificacion'
                : 'Sin conectar'}
          </Badge>
        </div>
        <p className="text-xs text-slate-500">
          Conecta un numero de Cloud API y comprueba por separado credenciales, webhook y recepcion.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        {busy === 'load' && <p className="text-xs text-slate-500">Consultando estado…</p>}

        {status && !configured && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            WhatsApp todavía no está disponible para tu cuenta. Te avisaremos cuando puedas
            conectarlo.
          </p>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        {notice && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</p>
        )}

        {status?.data.map((channel) => (
          <div key={channel.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {channel.businessName || 'WhatsApp Business'} · {channel.displayPhoneNumber}
                </p>
                <p className="text-xs text-slate-500">
                  WABA {channel.wabaId} · Phone Number ID {channel.phoneNumberId}
                </p>
              </div>
              <Badge
                variant={
                  channel.status === 'CONNECTED' &&
                  channel.credentialsVerified &&
                  channel.webhookSubscribed
                    ? 'success'
                    : channel.status === 'NEEDS_ATTENTION' || channel.status === 'CONNECTED'
                      ? 'warning'
                      : 'outline'
                }
              >
                {channel.status === 'CONNECTED' &&
                (!channel.credentialsVerified || !channel.webhookSubscribed)
                  ? 'Sin verificar'
                  : WHATSAPP_STATUS_LABEL[channel.status]}
              </Badge>
            </div>

            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <Fact
                done={channel.saved}
                title="Datos guardados"
                detail="Canal asociado a este workspace."
              />
              <Fact
                done={channel.credentialsVerified}
                title="Credenciales verificadas"
                detail={date(channel.lastHealthCheckAt) ?? 'Pendiente de validacion contra Meta.'}
              />
              <Fact
                done={channel.webhookSubscribed}
                title="App suscrita a la WABA"
                detail={
                  date(channel.webhookSubscribedAt) ?? 'Meta no ha confirmado la suscripcion.'
                }
              />
              <Fact
                done={Boolean(channel.lastInboundAt)}
                title="Recepcion comprobada"
                detail={date(channel.lastInboundAt) ?? 'Aún no hay un mensaje entrante asociado.'}
              />
            </div>

            {status.canManage && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={async () => {
                    if (
                      await action(
                        '/api/integrations/whatsapp/status',
                        { channelId: channel.id },
                        `verify:${channel.id}`,
                      )
                    ) {
                      setNotice('Credenciales y suscripcion verificadas nuevamente con Meta.');
                    }
                  }}
                >
                  {busy === `verify:${channel.id}` ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <RefreshCw />
                  )}
                  Verificar ahora
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => edit(channel)}
                >
                  Actualizar credencial
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={async () => {
                    if (
                      await action(
                        '/api/integrations/whatsapp/disconnect',
                        { channelId: channel.id },
                        `disconnect:${channel.id}`,
                      )
                    ) {
                      setNotice('Canal desconectado del CRM. El historial se conservo.');
                    }
                  }}
                >
                  {busy === `disconnect:${channel.id}` ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Unplug />
                  )}
                  Desconectar
                </Button>
              </div>
            )}
          </div>
        ))}

        {status?.canManage && (
          <form onSubmit={connect} className="space-y-3 border-t border-slate-100 pt-5">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {status.data.length > 0
                  ? 'Conectar o actualizar un numero'
                  : 'Conectar numero de prueba'}
              </p>
              <p className="text-xs text-slate-500">
                El token no se muestra despues de guardarlo y nunca queda en el navegador.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                required
                inputMode="numeric"
                placeholder="WABA ID"
                value={form.wabaId}
                onChange={(event) => setForm({ ...form, wabaId: event.target.value.trim() })}
              />
              <Input
                required
                inputMode="numeric"
                placeholder="Phone Number ID"
                value={form.phoneNumberId}
                onChange={(event) => setForm({ ...form, phoneNumberId: event.target.value.trim() })}
              />
              <Input
                required
                placeholder="Numero visible, por ejemplo +1 555…"
                value={form.displayPhoneNumber}
                onChange={(event) => setForm({ ...form, displayPhoneNumber: event.target.value })}
              />
              <Input
                placeholder="Nombre comercial (opcional)"
                value={form.businessName}
                onChange={(event) => setForm({ ...form, businessName: event.target.value })}
              />
              <Input
                className="md:col-span-2"
                required
                type="password"
                autoComplete="off"
                placeholder="Token de acceso de Meta"
                value={form.accessToken}
                onChange={(event) => setForm({ ...form, accessToken: event.target.value.trim() })}
              />
            </div>
            <Button type="submit" disabled={busy !== null || !configured}>
              {busy === 'connect' && <Loader2 className="animate-spin" />}
              Validar con Meta y guardar
            </Button>
          </form>
        )}

        {status && !status.canManage && (
          <p className="text-xs text-slate-500">
            Solo el owner o un admin puede modificar este canal.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
