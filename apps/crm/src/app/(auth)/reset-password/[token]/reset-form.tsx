'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setPending(true);
    try {
      const response = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const json = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setError(json.message ?? 'No se pudo cambiar la contraseña.');
        return;
      }
      setDone(true);
    } catch {
      setError('Se perdió la conexión. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <>
        <p role="status" className="mt-4 text-sm text-ash">
          Listo: tu contraseña cambió. Ya puedes entrar con la nueva.
        </p>
        <Button asChild className="mt-6 w-full">
          <Link href="/login">Iniciar sesión</Link>
        </Button>
      </>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <FormField label="Contraseña nueva" htmlFor="reset-password">
        <Input id="reset-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
      </FormField>
      <FormField label="Confirmar contraseña" htmlFor="reset-confirm">
        <Input id="reset-confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
      </FormField>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger-ink">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Guardando…' : 'Guardar contraseña'}
      </Button>
    </form>
  );
}
