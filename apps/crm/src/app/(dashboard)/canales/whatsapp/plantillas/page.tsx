import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { TemplatesManager } from '@/components/whatsapp-channels/templates-manager';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { prisma } from '@/lib/prisma';
import { listTemplates, placeholderCount, TEMPLATE_CATEGORY_LABEL, TEMPLATE_STATUS_LABEL, templateUnusableReason } from '@/lib/whatsapp/templates';

export const dynamic = 'force-dynamic';

/** P26: plantillas de WhatsApp (lo único que se puede enviar fuera de la ventana de 24 h). */
export default async function TemplatesPage() {
  const user = await requireCurrentUser();
  const workspaceId = user.workspace.id;
  const [templates, channels] = await Promise.all([
    listTemplates(workspaceId),
    prisma.whatsAppChannel.findMany({ where: { workspaceId, status: { not: 'DISCONNECTED' } }, orderBy: { createdAt: 'asc' }, select: { id: true, label: true, displayPhoneNumber: true } }),
  ]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Plantillas" subtitle="Canales · WhatsApp" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-5">
          <Button variant="ghost" size="sm" asChild className="-ml-3">
            <Link href="/canales/whatsapp">
              <ArrowLeft strokeWidth={1.75} /> Volver a WhatsApp
            </Link>
          </Button>
          <p className="text-xs text-graphite">
            Pasadas 24 horas desde el último mensaje del contacto, WhatsApp solo permite escribirle con una plantilla aprobada por Meta. Elige la
            plantilla en cada paso de tus estrategias de recuperación y seguimiento. Meta avisa los cambios de estado por webhook; también puedes sincronizar.
          </p>
          {channels.length === 0 && <p className="text-sm text-graphite">Conecta un número de WhatsApp para registrar plantillas.</p>}
          <TemplatesManager
            canManage={canManageChannels(user.role)}
            channels={channels.map((c) => ({ id: c.id, label: c.label || c.displayPhoneNumber }))}
            templates={templates.map((t) => {
              const count = placeholderCount(t.body);
              return {
                id: t.id,
                name: t.name,
                language: t.language,
                category: t.category,
                categoryLabel: TEMPLATE_CATEGORY_LABEL[t.category],
                status: t.status,
                statusLabel: TEMPLATE_STATUS_LABEL[t.status],
                body: t.body,
                variables: t.variables,
                placeholders: typeof count === 'number' ? count : 0,
                problem: templateUnusableReason(t, t.channelId),
                rejectedReason: t.rejectedReason,
                channelLabel: t.channel.label || t.channel.displayPhoneNumber,
                lastSyncedAt: t.lastSyncedAt?.toISOString() ?? null,
              };
            })}
          />
        </div>
      </div>
    </div>
  );
}
