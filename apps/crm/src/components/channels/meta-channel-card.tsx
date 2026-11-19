'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Unplug } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Account = {
  id: string;
  externalAccountId: string;
  displayName: string | null;
  status: 'DISCONNECTED' | 'CONNECTED' | 'NEEDS_ATTENTION' | 'REAUTH_REQUIRED';
  capabilities: string[];
  connectedAt: string | null;
  lastVerifiedAt: string | null;
  lastError?: string | null;
  /** Solo Instagram (P28): evidencia de funcionamiento real. */
  missingScopes?: string[];
  lastDmAt?: string | null;
  lastCommentAt?: string | null;
  lastReplyAt?: string | null;
};

type StatusResponse = { data: Account[]; canManage: boolean; configured: boolean };

const STATUS_LABEL: Record<Account['status'], string> = {
  DISCONNECTED: 'No conectado',
  CONNECTED: 'Conectado',
  NEEDS_ATTENTION: 'Requiere atención',
  REAUTH_REQUIRED: 'Reconexión requerida',
};

const STATUS_VARIANT: Record<Account['status'], 'success' | 'warning' | 'destructive' | 'outline'> = {
  DISCONNECTED: 'outline',
  CONNECTED: 'success',
  NEEDS_ATTENTION: 'warning',
  REAUTH_REQUIRED: 'destructive',
};

function date(value: string | null) {
  return value ? new Date(value).toLocaleString('es-CL') : null;
}

/**
 * Card real de conexion Meta, parametrizado por canal — Instagram y
 * Messenger usan exactamente la misma UI (fetch de estado, conectar via
 * redirect OAuth, verificar, desconectar); solo cambia el label y las URLs.
 * El "Fake Connect" de visual-test sigue viviendo aparte, en
 * integration-cards.tsx (spec Fase D1, seccion 20): esta card real no se usa
 * en ese entorno.
 */
export function MetaChannelCard(props: {
  channel: 'INSTAGRAM' | 'MESSENGER' | 'TIKTOK';
  label: string;
  accountNoun: string;
}) {
  const base = props.channel.toLowerCase();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [busy, setBusy] = useState<string | null>('load');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const response = await fetch(`/api/integrations/${base}/status`, { cache: 'no-store' });
    const data = (await response.json().catch(() => ({}))) as StatusResponse & { message?: string };
    if (!response.ok) throw new Error(data.message ?? `No se pudo consultar ${props.label}.`);
    setStatus(data);
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/integrations/${base}/status`, { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as StatusResponse & { message?: string };
        if (!response.ok) throw new Error(data.message ?? `No se pudo consultar ${props.label}.`);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function action(path: string, body: unknown, key: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!response.ok || data.ok === false) throw new Error(data.message ?? 'No se pudo completar la acción.');
      await load();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo completar la acción.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  const account = status?.data[0];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>{props.label}</CardTitle>
          {account && <Badge variant={STATUS_VARIANT[account.status]}>{STATUS_LABEL[account.status]}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {busy === 'load' && <p className="text-xs text-slate-500">Consultando estado…</p>}
        {status && !status.configured && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Falta configuración del servidor para {props.label} (variables de entorno de la app de {props.channel === "TIKTOK" ? "TikTok" : "Meta"}).
          </p>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</p>}

        {account ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900">{account.displayName ?? account.externalAccountId}</p>
            <p className="text-xs text-slate-500">
              {props.accountNoun} conectado{date(account.connectedAt) ? ` el ${date(account.connectedAt)}` : ''} · última verificación: {date(account.lastVerifiedAt) ?? 'pendiente'}
            </p>
            {account.status !== 'CONNECTED' && account.lastError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">Último error de Meta: {account.lastError}</p>
            )}
            {account.missingScopes && account.missingScopes.length > 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Permisos no concedidos: {account.missingScopes.join(', ')}. Reconecta y acepta todos los permisos.
              </p>
            )}
            {account.lastDmAt !== undefined && (
              <ul className="space-y-0.5 text-xs text-slate-600">
                <li>Último DM recibido: {date(account.lastDmAt ?? null) ?? 'ninguno todavía'}</li>
                <li>Último comentario recibido: {date(account.lastCommentAt ?? null) ?? 'ninguno todavía'}</li>
                <li>Última respuesta enviada: {date(account.lastReplyAt ?? null) ?? 'ninguna todavía'}</li>
              </ul>
            )}
            {status?.canManage && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={async () => {
                    if (await action(`/api/integrations/${base}/verify`, { channelAccountId: account.id }, 'verify')) {
                      setNotice('Conexión verificada contra Meta.');
                    }
                  }}
                >
                  {busy === 'verify' ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  Verificar ahora
                </Button>
                {(account.status !== 'CONNECTED' || (account.missingScopes?.length ?? 0) > 0) && (
                  <Button size="sm" asChild>
                    <a href={`/api/integrations/${base}/oauth/connect`}>Reconectar {props.label}</a>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={async () => {
                    if (await action(`/api/integrations/${base}/disconnect`, { channelAccountId: account.id }, 'disconnect')) {
                      setNotice('Canal desconectado. El historial se conservó.');
                    }
                  }}
                >
                  {busy === 'disconnect' ? <Loader2 className="animate-spin" /> : <Unplug />}
                  Desconectar
                </Button>
              </div>
            )}
          </div>
        ) : (
          status?.canManage && (
            <Button size="sm" disabled={!status.configured} asChild={status.configured}>
              {status.configured ? <a href={`/api/integrations/${base}/oauth/connect`}>Conectar {props.label}</a> : <span>Conectar {props.label}</span>}
            </Button>
          )
        )}
        {status && !status.canManage && <p className="text-xs text-slate-500">Solo el owner o un admin puede modificar este canal.</p>}
      </CardContent>
    </Card>
  );
}
