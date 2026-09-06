'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
    });
    const result = await response.json().catch(() => null);

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
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10 text-white">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-400/15 text-amber-300">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">
          Suscripcion vencida
        </p>
        <h1 className="text-3xl font-black tracking-tight">Renueva el acceso mensual de {workspaceName}</h1>
        <p className="mt-4 text-sm leading-6 text-slate-300">
          Este CRM guarda los leads, contactos, oportunidades y actividades del cliente, pero el acceso se pausa
          cuando termina el periodo mensual.
        </p>

        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Ultimo vencimiento</p>
          <p className="mt-1 font-semibold text-white">
            {expiresAt ? new Date(expiresAt).toLocaleDateString('es-CL') : 'Sin fecha registrada'}
          </p>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</p>}

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Button onClick={renew} disabled={loading} className="h-10 flex-1">
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Renovar 30 dias
          </Button>
          <Button onClick={logout} variant="outline" className="h-10 flex-1 border-white/20 bg-transparent text-white hover:bg-white/10">
            <LogOut className="h-4 w-4" />
            Salir
          </Button>
        </div>
      </div>
    </div>
  );
}
