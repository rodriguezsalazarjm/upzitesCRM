'use client';

import { Button } from '@/components/ui/button';

export function LogoutForm() {
  function clearLocalUserData() {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith('crm:')) window.localStorage.removeItem(key);
    }
  }

  return (
    <form action="/api/auth/logout" method="post" className="mt-2" onSubmit={clearLocalUserData}>
      <Button
        type="submit"
        variant="ghost"
        className="h-8 w-full justify-start text-xs text-slate-500"
      >
        Cerrar sesión
      </Button>
    </form>
  );
}
