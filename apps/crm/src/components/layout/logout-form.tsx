'use client';

import { Button } from '@/components/ui/button';
import { useState } from 'react';

export function LogoutForm() {
  const [submitting, setSubmitting] = useState(false);
  function clearLocalUserData() {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith('crm:')) window.localStorage.removeItem(key);
    }
  }

  async function logout(event: React.FormEvent<HTMLFormElement>) {
    if (submitting) return;
    event.preventDefault();
    const form = event.currentTarget;
    setSubmitting(true);
    clearLocalUserData();
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch('/api/push/subscriptions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
    } finally {
      form.submit();
    }
  }

  return (
    <form action="/api/auth/logout" method="post" className="mt-2" onSubmit={logout}>
      <Button
        type="submit"
        variant="ghost"
        className="h-8 w-full justify-start text-xs text-fog hover:bg-white/[0.07] hover:text-white"
      >
        {submitting ? 'Cerrando…' : 'Cerrar sesión'}
      </Button>
    </form>
  );
}
