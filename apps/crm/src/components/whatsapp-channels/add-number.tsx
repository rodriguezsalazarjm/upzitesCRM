'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

type SignupConfig = { enabled: true; appId: string; configId: string; graphVersion: string } | { enabled: false; missing: string[] };

type FacebookSdk = {
  init: (options: Record<string, unknown>) => void;
  login: (callback: (response: { authResponse?: { code?: string } | null }) => void, options: Record<string, unknown>) => void;
};
type FacebookWindow = Window & { FB?: FacebookSdk; fbAsyncInit?: () => void };

function loadFacebookSdk(appId: string, version: string): Promise<FacebookSdk> {
  const w = window as FacebookWindow;
  if (w.FB) return Promise.resolve(w.FB);
  return new Promise((resolve, reject) => {
    w.fbAsyncInit = () => {
      w.FB!.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve(w.FB!);
    };
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onerror = () => reject(new Error('No se pudo cargar el inicio de sesión de Meta.'));
    document.body.appendChild(script);
  });
}

function isFacebookOrigin(origin: string) {
  try {
    const host = new URL(origin).hostname;
    return host === 'facebook.com' || host.endsWith('.facebook.com');
  } catch {
    return false;
  }
}

type SignupIds = { wabaId: string; phoneNumberId: string };

/**
 * Agregar un numero. El camino principal es Embedded Signup de Meta: el cliente
 * autoriza en la ventana de Meta y nunca copia un token. La conexion manual
 * queda plegada, para pilotos asistidos.
 */
export function AddNumber({ config, canManage }: { config: SignupConfig; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [form, setForm] = useState({ wabaId: '', phoneNumberId: '', displayPhoneNumber: '', businessName: '', accessToken: '' });

  if (!canManage) return null;

  async function finish(url: string, body: unknown) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message ?? 'Meta no confirmó la conexión.');
    return data.data as { id: string; reconnected?: boolean };
  }

  async function startSignup() {
    if (!config.enabled) return;
    setBusy('signup');
    setError(null);
    setNotice(null);
    let resolveIds: (ids: SignupIds | null) => void = () => {};
    const ids = new Promise<SignupIds | null>((resolve) => (resolveIds = resolve));
    const listener = (event: MessageEvent) => {
      if (!isFacebookOrigin(event.origin) || typeof event.data !== 'string') return;
      try {
        const data = JSON.parse(event.data) as { type?: string; event?: string; data?: { waba_id?: string; phone_number_id?: string; current_step?: string } };
        if (data.type !== 'WA_EMBEDDED_SIGNUP') return;
        if (data.event?.startsWith('FINISH') && data.data?.waba_id && data.data.phone_number_id) {
          resolveIds({ wabaId: data.data.waba_id, phoneNumberId: data.data.phone_number_id });
        } else if (data.event === 'CANCEL' || data.event === 'ERROR') {
          resolveIds(null);
        }
      } catch {
        // Mensajes de Meta que no son de Embedded Signup.
      }
    };
    window.addEventListener('message', listener);
    try {
      const FB = await loadFacebookSdk(config.appId, config.graphVersion);
      const code = await new Promise<string | null>((resolve) =>
        FB.login((response) => resolve(response.authResponse?.code ?? null), {
          config_id: config.configId,
          response_type: 'code',
          override_default_response_type: true,
          extras: { setup: {}, sessionInfoVersion: '3' },
        }),
      );
      // El code vence en ~30 s: los ids pueden llegar justo antes o despues.
      const assets = await Promise.race([ids, new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000))]);
      if (!code || !assets) throw new Error('La conexión con Meta se canceló o no devolvió el número. Vuelve a intentarlo.');
      const saved = await finish('/api/integrations/whatsapp/embedded-signup', { code, ...assets, ...(pin ? { pin } : {}) });
      router.push(`/canales/whatsapp/${saved.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo conectar el número.');
    } finally {
      window.removeEventListener('message', listener);
      setBusy(null);
    }
  }

  async function connectManually(event: FormEvent) {
    event.preventDefault();
    setBusy('manual');
    setError(null);
    setNotice(null);
    try {
      const saved = await finish('/api/integrations/whatsapp/connect', form);
      setForm({ wabaId: '', phoneNumberId: '', displayPhoneNumber: '', businessName: '', accessToken: '' });
      setNotice(saved.reconnected ? 'Número reconectado y verificado con Meta.' : 'Número conectado y verificado con Meta.');
      router.push(`/canales/whatsapp/${saved.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo conectar el número.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>Agregar número</Eyebrow>
          <p className="mt-1 text-xs text-graphite">Conecta un número de WhatsApp Business autorizando con tu cuenta de Meta.</p>
        </div>
        {config.enabled && (
          <Button onClick={startSignup} disabled={busy !== null}>
            {busy === 'signup' ? <Loader2 className="animate-spin" /> : <Plus strokeWidth={1.75} />} Conectar con Meta
          </Button>
        )}
      </div>

      {config.enabled ? (
        <FormField
          label="PIN de verificación en dos pasos (opcional)"
          htmlFor="wa-pin"
          description="Solo para un número nuevo que aún no está registrado en la API: Meta lo pide para activarlo."
          className="max-w-xs"
        >
          <Input id="wa-pin" inputMode="numeric" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} />
        </FormField>
      ) : (
        <div className="rounded-xl border border-solar/50 bg-solar/10 p-3 text-xs text-warning-ink">
          <p className="font-semibold">La conexión con Meta (Embedded Signup) no está habilitada en este entorno.</p>
          <p className="mt-1">
            Falta configurar: {config.missing.join(', ')}. Además, la app de Meta debe ser Tech Provider con una configuración de
            Facebook Login for Business para WhatsApp. Mientras tanto, un número piloto se puede conectar a mano.
          </p>
        </div>
      )}

      <details className="rounded-xl border border-mist p-3" open={!config.enabled}>
        <summary className="cursor-pointer text-xs font-semibold text-carbon">Conexión manual (pilotos asistidos)</summary>
        <p className="mt-2 text-[11px] text-soft">
          Usa un token de usuario del sistema de tu Meta Business con permisos whatsapp_business_management y
          whatsapp_business_messaging. Se verifica con Meta antes de guardarse, se guarda cifrado y nunca se vuelve a mostrar.
        </p>
        <form onSubmit={connectManually} className="mt-3 grid gap-3 sm:grid-cols-2">
          <FormField label="WABA ID" htmlFor="wa-waba" required>
            <Input id="wa-waba" inputMode="numeric" value={form.wabaId} onChange={(event) => setForm({ ...form, wabaId: event.target.value.trim() })} required />
          </FormField>
          <FormField label="Phone Number ID" htmlFor="wa-phone-id" required>
            <Input id="wa-phone-id" inputMode="numeric" value={form.phoneNumberId} onChange={(event) => setForm({ ...form, phoneNumberId: event.target.value.trim() })} required />
          </FormField>
          <FormField label="Número visible" htmlFor="wa-display" required>
            <Input id="wa-display" placeholder="+56 9 1234 5678" value={form.displayPhoneNumber} onChange={(event) => setForm({ ...form, displayPhoneNumber: event.target.value })} required />
          </FormField>
          <FormField label="Nombre del negocio" htmlFor="wa-business">
            <Input id="wa-business" value={form.businessName} onChange={(event) => setForm({ ...form, businessName: event.target.value })} />
          </FormField>
          <FormField label="Token de acceso" htmlFor="wa-token" required className="sm:col-span-2">
            <Input id="wa-token" type="password" autoComplete="off" value={form.accessToken} onChange={(event) => setForm({ ...form, accessToken: event.target.value })} required />
          </FormField>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" variant="outline" disabled={busy !== null}>
              {busy === 'manual' && <Loader2 className="animate-spin" />} Verificar y conectar
            </Button>
          </div>
        </form>
      </details>

      {error && <p className="text-xs text-danger-ink" role="alert">{error}</p>}
      {notice && <p className="text-xs text-success-ink">{notice}</p>}
    </Card>
  );
}
