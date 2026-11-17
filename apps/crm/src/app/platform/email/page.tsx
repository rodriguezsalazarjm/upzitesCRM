import { notFound } from 'next/navigation';
import { currentPlatformActor } from '@/lib/platform/access';
import { ActionForm } from '@/components/platform/action-form';
import { DataTable, Empty, PlatformPage, Section, fmtDate } from '@/components/platform/ui';
import { prisma } from '@/lib/prisma';
import { emailReadiness } from '@/lib/platform/transactional-email';

export const dynamic = 'force-dynamic';

const KIND: Record<string, string> = { INVITATION: 'Invitación', PASSWORD_RESET: 'Contraseña', SECURITY: 'Seguridad', TEST: 'Prueba' };
const STATUS: Record<string, string> = { SENT: 'Enviado', DELIVERED: 'Entregado', OPENED: 'Abierto', CLICKED: 'Clic', BOUNCED: 'Rebotó', COMPLAINED: 'Spam', FAILED: 'Falló', QUEUED: 'En cola', UNSUBSCRIBED: 'Baja' };

/** P25: estado del email transaccional real (Resend) y registro de los envíos de plataforma. */
export default async function PlatformEmailPage() {
  // El layout no basta: Next renderiza la pagina en paralelo y su payload saldria en el 404.
  if (!(await currentPlatformActor())) notFound();
  const checks = emailReadiness();
  const webhookUrl = `${(process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '')}/api/webhooks/email`;
  const ready = checks.every((c) => c.ok);
  const recent = await prisma.platformEmailMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });

  return (
    <PlatformPage title="Email" subtitle={ready ? 'Resend configurado. Las entregas y rebotes llegan por el webhook.' : 'Email real sin configurar: los envíos usan el proveedor guionado o quedan sin enviar.'}>
      <Section title="Configuración" description="Variables de entorno del servidor. Se muestra si están, nunca su valor.">
        <ul className="space-y-2 text-sm" data-email-readiness>
          {checks.map((c) => (
            <li key={c.key} className="flex flex-wrap items-baseline gap-2" data-check={c.key} data-ok={c.ok}>
              <span className={c.ok ? 'font-semibold text-success-ink' : 'font-semibold text-danger-ink'}>{c.ok ? '✓' : '✗'} {c.key}</span>
              {!c.ok && <span className="text-xs text-soft">{c.help}</span>}
            </li>
          ))}
          <li className="text-xs text-soft">Webhook en Resend (eventos delivered, bounced, complained, failed): <code className="break-all">{webhookUrl}</code></li>
        </ul>
      </Section>

      <Section title="Prueba" description="Envía un email de plataforma a tu propio correo. Revisa que llegue a la bandeja (no a spam) y que aquí pase a Entregado.">
        <ActionForm endpoint="/api/platform/email/test" submitLabel="Enviarme una prueba" fields={[]} />
      </Section>

      <Section title={`Envíos de plataforma (${recent.length})`} description="Invitaciones, contraseñas y pruebas. No se guarda el contenido: lleva enlaces de un solo uso.">
        {recent.length === 0 ? <Empty>Sin envíos todavía.</Empty> : (
          <DataTable head={['Fecha', 'Tipo', 'Para', 'Estado', 'Detalle']}>
            {recent.map((m) => (
              <tr key={m.id} data-platform-email={m.id} data-status={m.status}>
                <td className="py-2 pr-4">{fmtDate(m.createdAt)}</td>
                <td className="py-2 pr-4">{KIND[m.kind] ?? m.kind}</td>
                <td className="py-2 pr-4 break-all">{m.toEmail}</td>
                <td className="py-2 pr-4">{STATUS[m.status] ?? m.status}</td>
                <td className="py-2 pr-4 text-xs text-soft">{m.lastError ?? (m.deliveredAt ? `Entregado ${fmtDate(m.deliveredAt)}` : '')}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>
    </PlatformPage>
  );
}
