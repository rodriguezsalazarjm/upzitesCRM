'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Wordmark } from '@/components/ui/wordmark';

/**
 * Solicitud de recuperacion. La confirmacion es la misma exista o no la
 * cuenta: la pantalla nunca dice si un email esta registrado.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const response = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (response.status === 429) {
        setError('Demasiados intentos. Espera un momento y vuelve a intentarlo.');
        return;
      }
      if (!response.ok) {
        setError('Revisa el correo e intenta de nuevo.');
        return;
      }
      setSent(true);
    } catch {
      setError('Se perdió la conexión. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-md">
        <Wordmark className="mb-8" />
        <div className="rounded-2xl border border-line bg-paper p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-soft">Cuenta</p>
          <h1 className="type-display mt-2 text-[32px] leading-[0.95] text-carbon">Recupera tu contraseña</h1>
          {sent ? (
            <p role="status" className="mt-4 text-sm text-ash">
              Si <strong>{email.trim()}</strong> tiene una cuenta, te enviamos un enlace para elegir una contraseña nueva. Vence en 60
              minutos. Revisa también la carpeta de spam.
            </p>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <p className="text-sm text-ash">Escribe el correo con el que entras y te enviaremos un enlace.</p>
              <FormField label="Correo electrónico" htmlFor="forgot-email">
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  placeholder="tu@empresa.cl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </FormField>
              {error && (
                <p role="alert" className="text-sm font-medium text-danger-ink">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? 'Enviando…' : 'Enviar enlace'}
              </Button>
            </form>
          )}
          <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-electric hover:underline">
            Volver a iniciar sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
