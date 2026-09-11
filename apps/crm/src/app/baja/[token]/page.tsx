import { resolveUnsubscribeToken } from '@/lib/email/unsubscribe';
import { BajaClient } from './baja-client';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Cancelar suscripcion' };

/**
 * Pagina publica de baja.
 *
 * La baja NO se ejecuta al abrir la pagina: hace falta confirmar. Los clientes
 * de correo y los antivirus corporativos siguen los enlaces para escanearlos, y
 * un GET que da de baja convertiria ese escaneo en una desuscripcion que el
 * destinatario nunca pidio.
 */
export default async function BajaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const target = await resolveUnsubscribeToken(token);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        {!target ? (
          <>
            <h1 className="text-lg font-semibold text-slate-900">Enlace no valido</h1>
            <p className="mt-2 text-sm text-slate-600">
              Este enlace de baja ya no sirve. Si sigues recibiendo correos, responde a cualquiera de
              ellos y lo resolvemos.
            </p>
          </>
        ) : (
          <BajaClient
            token={token}
            email={target.toEmail}
            alreadyUnsubscribed={target.alreadyUnsubscribed}
          />
        )}
      </div>
    </main>
  );
}
