'use client';

import { useRouter } from 'next/navigation';
import { LogOut, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Eyebrow } from '@/components/ui/eyebrow';
import { Wordmark } from '@/components/ui/wordmark';

/**
 * Suspension administrativa (P0-B). No es un vencimiento: no se resuelve
 * pagando desde aqui, la reactiva Upzites. Los datos siguen guardados.
 */
export function SubscriptionSuspended({ workspaceName }: { workspaceName: string }) {
  const router = useRouter();

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
            <ShieldAlert className="h-6 w-6" strokeWidth={1.75} />
          </div>
          <Eyebrow className="mb-2 text-warning-ink">Cuenta suspendida</Eyebrow>
          <h1 className="type-display text-[34px] leading-[0.95] text-carbon sm:text-[40px]">
            El acceso a {workspaceName} está suspendido
          </h1>
          <p className="mt-4 text-sm leading-6 text-ash">
            Tus contactos, conversaciones, pedidos y el resto de la información siguen guardados. Escríbenos a
            Upzites para revisar la cuenta y reactivarla.
          </p>
          <div className="mt-7">
            <Button onClick={logout} variant="outline" className="w-full">
              <LogOut />
              Salir
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
