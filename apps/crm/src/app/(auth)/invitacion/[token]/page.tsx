import Link from 'next/link';
import { Wordmark } from '@/components/ui/wordmark';
import { inspectInvitation } from '@/lib/invitations';
import { prisma } from '@/lib/prisma';
import { readSessionCookie } from '@/lib/session';
import { AcceptInvitationForm } from './accept-form';

export const dynamic = 'force-dynamic';

/**
 * Aceptar una invitacion (P0-D).
 *  - Email sin cuenta: nombre + contrasena → cuenta global + membership.
 *  - Email con cuenta: iniciar sesion con ESA cuenta y aceptar (solo se agrega
 *    la membership; nunca se crea una segunda cuenta).
 */
export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await inspectInvitation(token);
  const session = await readSessionCookie();
  const sessionUser = session
    ? await prisma.user.findUnique({ where: { id: session.userId }, select: { email: true } })
    : null;

  let body: React.ReactNode;
  if (view.status !== 'VALID') {
    const message = {
      NOT_FOUND: 'Este enlace no es válido. Si te reenviaron la invitación, usa el enlace más reciente.',
      EXPIRED: 'La invitación venció. Pide que te la reenvíen.',
      REVOKED: 'La invitación fue revocada.',
      ACCEPTED: 'Esta invitación ya fue usada.',
    }[view.status];
    body = (
      <>
        <p className="mt-4 text-sm text-ash">{message}</p>
        <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-electric hover:underline">
          Ir a iniciar sesión
        </Link>
      </>
    );
  } else if (!view.accountExists) {
    body = (
      <>
        <p className="mt-4 text-sm text-ash">
          Crea tu cuenta para <strong>{view.email}</strong>. Con ella podrás entrar a este y otros negocios.
        </p>
        <AcceptInvitationForm token={token} mode="new-account" />
      </>
    );
  } else if (sessionUser?.email === view.email) {
    body = (
      <>
        <p className="mt-4 text-sm text-ash">Estás conectado como <strong>{view.email}</strong>.</p>
        <AcceptInvitationForm token={token} mode="existing-session" />
      </>
    );
  } else {
    body = (
      <>
        <p className="mt-4 text-sm text-ash">
          Ya existe una cuenta para <strong>{view.email}</strong>. Inicia sesión con ella para aceptar
          {sessionUser ? ` (ahora estás conectado como ${sessionUser.email})` : ''}.
        </p>
        <Link
          href={`/login?next=${encodeURIComponent(`/invitacion/${token}`)}`}
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-electric px-4 text-sm font-semibold text-white"
        >
          Iniciar sesión con {view.email}
        </Link>
      </>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6 py-12">
      <div className="w-full max-w-md">
        <Wordmark className="mb-8" />
        <div className="rounded-2xl border border-line bg-paper p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-soft">Invitación</p>
          <h1 className="type-display mt-2 text-[32px] leading-[0.95] text-carbon">
            {view.workspaceName ? `Únete a ${view.workspaceName}` : 'Invitación'}
          </h1>
          {view.role && <p className="mt-1 text-xs text-soft">Rol: {view.role}</p>}
          {body}
        </div>
      </div>
    </div>
  );
}
