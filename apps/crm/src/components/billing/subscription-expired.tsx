'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Wordmark } from '@/components/ui/wordmark';

export function SubscriptionExpired({
  workspaceName,
  expiresAt,
}: {
  workspaceName: string;
  expiresAt: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function renew() {
    setLoading(true);
    setError('');

    const response = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planKey: 'monthly' }),
    }).catch(() => null);
    const result = await response?.json().catch(() => null);

    if (!response) {
      setLoading(false);
      setError('Se perdió la conexión. Revisa tu conexión e intenta de nuevo.');
      return;
    }

    if (!response.ok || !result?.checkoutUrl) {
      setLoading(false);
      setError(result?.message ?? 'No pudimos iniciar el pago. Intenta nuevamente o contacta a Upzites.');
      return;
    }

    window.location.href = result.checkoutUrl;
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 py-10">
      <div className="w-full max-w-lg">
        <Wordmark className="mb-8" />
        <div className="rounded-2xl border border-line bg-paper p-8">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-solar/30 text-warning-ink">
            <AlertTriangle className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <Eyebrow className="mb-2 text-warning-ink">Suscripción vencida</Eyebrow>
          <h1 className="type-display text-[34px] leading-[0.95] text-carbon sm:text-[40px]">
            Renueva el acceso mensual de {workspaceName}
          </h1>
          <p className="mt-4 text-sm leading-6 text-ash">
            Tus leads, contactos, oportunidades y actividades siguen guardados. El acceso se pausa cuando termina el
            periodo mensual y vuelve apenas renuevas.
          </p>

          <div className="mt-6 rounded-xl bg-ivory p-4 text-sm">
            <Eyebrow>Último vencimiento</Eyebrow>
            <p className="mt-1 font-semibold text-carbon">
              {expiresAt ? new Date(expiresAt).toLocaleDateString('es-CL') : 'Sin fecha registrada'}
            </p>
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-tomato/12 px-3 py-2 text-xs text-danger-ink">
              {error}
            </p>
          )}

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button onClick={renew} disabled={loading} className="w-full sm:flex-1">
              {loading ? <RefreshCw className="animate-spin" /> : <ArrowRight />}
              Renovar 30 días
            </Button>
            <Button onClick={logout} variant="outline" className="w-full sm:flex-1">
              <LogOut />
              Salir
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
