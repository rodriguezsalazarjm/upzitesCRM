'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

/** Cuenta nueva (nombre + contrasena) o aceptar con la sesion actual. */
export function AcceptInvitationForm({ token, mode }: { token: string; mode: 'new-account' | 'existing-session' }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (mode === 'new-account' && password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setPending(true);
    const response = await fetch('/api/invitations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mode === 'new-account' ? { token, name, password, confirmPassword } : { token }),
    });
    const json = (await response.json().catch(() => ({}))) as { message?: string };
    if (!response.ok) {
      setPending(false);
      setError(json.message ?? 'No se pudo aceptar la invitación.');
      return;
    }
    window.location.href = '/dashboard';
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      {mode === 'new-account' && (
        <>
          <FormField label="Tu nombre" htmlFor="inv-name">
            <Input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" />
          </FormField>
          <FormField label="Contraseña" htmlFor="inv-password">
            <Input id="inv-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          </FormField>
          <FormField label="Confirmar contraseña" htmlFor="inv-confirm">
            <Input id="inv-confirm" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
          </FormField>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm font-medium text-danger-ink">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Procesando…' : mode === 'new-account' ? 'Crear cuenta y unirme' : 'Aceptar invitación'}
      </Button>
    </form>
  );
}
