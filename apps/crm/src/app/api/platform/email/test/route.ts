import { NextResponse } from 'next/server';
import { platformGuard } from '@/lib/platform/access';
import { handlePlatform } from '@/lib/platform/http';
import { platformEmailConfigured, sendPlatformEmail } from '@/lib/platform/transactional-email';

export const dynamic = 'force-dynamic';

/**
 * Envia un email de prueba de plataforma SOLO al email del propio operador:
 * no acepta destinatario, asi no sirve para escribirle a terceros.
 */
export async function POST() {
  const guard = await platformGuard();
  if (!guard.ok) return guard.response;
  if (!platformEmailConfigured()) {
    return NextResponse.json({ code: 'NOT_CONFIGURED', message: 'Falta RESEND_API_KEY o PLATFORM_EMAIL_FROM.' }, { status: 409 });
  }
  return handlePlatform(async () => {
    const outcome = await sendPlatformEmail({
      kind: 'TEST',
      to: guard.actor.email,
      subject: 'Prueba de email de Upzites Flow',
      text: 'Si lees esto, el email transaccional de la plataforma sale por Resend desde un dominio verificado.\n',
      html: '<p>Si lees esto, el email transaccional de la plataforma sale por Resend desde un dominio verificado.</p>',
    });
    if (!outcome.sent) return NextResponse.json({ code: outcome.reason, message: `Resend rechazó el envío: ${outcome.error ?? outcome.reason}` }, { status: 502 });
    return NextResponse.json({ data: { sent: true } });
  });
}
