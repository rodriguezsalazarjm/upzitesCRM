'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Inicia el checkout SaaS de Mercado Pago para un plan del catalogo. El precio
 * lo decide el servidor (Price Book, CLP); aqui solo se elige el plan.
 */
export function RenewSubscriptionButton({
  planCode,
  label,
  variant = 'default',
}: {
  planCode: 'START' | 'PRO' | 'SCALE';
  label: string;
  variant?: 'default' | 'outline';
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function renew() {
    setLoading(true);
    setError('');

    const response = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planCode, currency: 'CLP' }),
    }).catch(() => null);
    const result = await response?.json().catch(() => null);

    if (!response) {
      setLoading(false);
      setError('Se perdió la conexión. Revisa tu conexión e intenta de nuevo.');
      return;
    }

    if (!response.ok || !result?.checkoutUrl) {
      setLoading(false);
      setError(result?.message ?? 'No pudimos iniciar el pago. Intenta nuevamente.');
      return;
    }

    window.location.href = result.checkoutUrl;
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" size="sm" variant={variant} className="h-8 text-xs" onClick={renew} disabled={loading}>
        <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        {label}
      </Button>
      {error && <p role="alert" className="text-[11px] font-medium text-danger-ink">{error}</p>}
    </div>
  );
}
