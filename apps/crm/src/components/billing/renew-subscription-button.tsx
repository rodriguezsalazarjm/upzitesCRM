'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function RenewSubscriptionButton() {
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
      setError(result?.message ?? 'No pudimos iniciar el pago. Intenta nuevamente.');
      return;
    }

    window.location.href = result.checkoutUrl;
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" size="sm" className="h-8 text-xs" onClick={renew} disabled={loading}>
        <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        Renovar 30 dias
      </Button>
      {error && <p className="text-[11px] font-medium text-red-600">{error}</p>}
    </div>
  );
}
