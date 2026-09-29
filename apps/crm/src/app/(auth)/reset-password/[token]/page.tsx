import Link from 'next/link';
import { Wordmark } from '@/components/ui/wordmark';
import { inspectPasswordResetToken } from '@/lib/password-reset';
import { ResetPasswordForm } from './reset-form';

export const dynamic = 'force-dynamic';

/** Elegir contrasena nueva con un enlace de recuperacion (P0-D). */
export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const state = await inspectPasswordResetToken(token);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-md">
        <Wordmark className="mb-8" />
        <div className="rounded-2xl border border-line bg-paper p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-soft">Cuenta</p>
          <h1 className="type-display mt-2 text-[32px] leading-[0.95] text-carbon">Nueva contraseña</h1>
          {state === 'VALID' ? (
            <ResetPasswordForm token={token} />
          ) : (
            <>
              <p className="mt-4 text-sm text-ash">
                {state === 'EXPIRED'
                  ? 'El enlace venció. Pide uno nuevo.'
                  : state === 'USED'
                    ? 'Este enlace ya se usó o fue reemplazado por uno más reciente.'
                    : 'Este enlace no es válido. Pide uno nuevo.'}
              </p>
              <Link href="/forgot-password" className="mt-6 inline-block text-sm font-semibold text-electric hover:underline">
                Pedir un enlace nuevo
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
