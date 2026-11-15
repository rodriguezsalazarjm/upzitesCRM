import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { ChannelActions } from '@/components/whatsapp-channels/channel-actions';
import { ChannelSettingsForm } from '@/components/whatsapp-channels/channel-settings-form';
import { ChannelStatusBadge, WebhookStatusBadge, formatWhen } from '@/components/whatsapp-channels/status-badges';
import { TestSend } from '@/components/whatsapp-channels/test-send';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { USAGE_LABEL } from '@/lib/whatsapp/channel-settings';
import { ChannelManagerError, channelOptions, getChannel, testRecipients } from '@/lib/whatsapp/channel-manager';

export const dynamic = 'force-dynamic';

const ACTION_LABEL: Record<string, string> = {
  'whatsapp.channel_connected': 'Número conectado',
  'whatsapp.channel_reconnected': 'Número reconectado',
  'whatsapp.credentials_updated': 'Credencial actualizada',
  'whatsapp.credentials_verified': 'Verificado con Meta',
  'whatsapp.verification_failed': 'Meta rechazó la verificación',
  'whatsapp.connect_failed': 'Intento de conexión fallido',
  'whatsapp.channel_disconnected': 'Número desconectado',
  'whatsapp.settings_updated': 'Configuración actualizada',
  'whatsapp.webhook_tested': 'Webhook probado',
  'whatsapp.webhook_test_failed': 'Prueba de webhook fallida',
  'whatsapp.test_send_queued': 'Envío de prueba encolado',
  'whatsapp.context_resolved': 'Conversación con contexto del número',
  'whatsapp.human_fallback': 'Conversación pasada a una persona',
};

function activityDetail(metadata: unknown) {
  const data = (metadata ?? {}) as Record<string, unknown>;
  if (typeof data.reason === 'string' && data.reason) return data.reason;
  if (Array.isArray(data.warnings) && data.warnings.length) return data.warnings.join('; ');
  if (Array.isArray(data.changed) && data.changed.length) return `Cambió: ${data.changed.length} ${data.changed.length === 1 ? 'campo' : 'campos'}`;
  if (typeof data.code === 'string') return `Código: ${data.code}`;
  if (typeof data.subscribed === 'boolean') return data.subscribed ? 'Meta confirma la suscripción' : 'Meta no muestra la suscripción';
  return null;
}

export default async function WhatsAppChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();
  const workspaceId = user.workspace.id;
  const canManage = canManageChannels(user.role);

  const channel = await getChannel(workspaceId, id).catch((error) => {
    if (error instanceof ChannelManagerError && error.status === 404) return null;
    throw error;
  });
  if (!channel) notFound();

  const [options, recipients] = await Promise.all([channelOptions(workspaceId), canManage ? testRecipients(workspaceId, id) : []]);
  const names = new Map(options.members.map((member) => [member.id, member.name]));
  const disconnected = channel.displayStatus === 'DISCONNECTED';

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title={channel.label || channel.businessName || channel.displayPhoneNumber} subtitle={`WhatsApp · ${channel.displayPhoneNumber}`} />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-5">
          <Button variant="ghost" size="sm" asChild className="-ml-3">
            <Link href="/canales/whatsapp">
              <ArrowLeft strokeWidth={1.75} /> Volver a WhatsApp
            </Link>
          </Button>

          <Card className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <ChannelStatusBadge status={channel.displayStatus} />
              <WebhookStatusBadge status={channel.webhookStatus} />
              {channel.planLimitedAt && <span className="text-xs font-semibold text-danger-ink">Limitado por el plan: no envía ni atiende con IA.</span>}
            </div>
            <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
              <div><dt className="text-soft">Número</dt><dd className="font-semibold text-carbon">{channel.displayPhoneNumber}</dd></div>
              <div><dt className="text-soft">WABA ID</dt><dd className="break-all font-semibold text-carbon">{channel.wabaId}</dd></div>
              <div><dt className="text-soft">Phone Number ID</dt><dd className="break-all font-semibold text-carbon">{channel.phoneNumberId}</dd></div>
              <div><dt className="text-soft">Verificado con Meta</dt><dd className="font-semibold text-carbon">{formatWhen(channel.lastHealthCheckAt)}</dd></div>
              <div><dt className="text-soft">Último evento de Meta</dt><dd className="font-semibold text-carbon">{formatWhen(channel.lastWebhookAt)}</dd></div>
              <div><dt className="text-soft">Último mensaje recibido</dt><dd className="font-semibold text-carbon">{formatWhen(channel.lastInboundAt)}</dd></div>
              <div><dt className="text-soft">Recibidos (7 días)</dt><dd className="font-semibold text-carbon">{channel.stats.received7d}</dd></div>
              <div><dt className="text-soft">Fallos de envío (7 días)</dt><dd className="font-semibold text-carbon">{channel.stats.failed7d}</dd></div>
              <div><dt className="text-soft">Uso · conexión</dt><dd className="font-semibold text-carbon">{USAGE_LABEL[channel.usage]} · {channel.connectionMethod === 'EMBEDDED_SIGNUP' ? 'Meta (Embedded Signup)' : channel.connectionMethod === 'MANUAL' ? 'Manual' : 'Sin registro'}</dd></div>
            </dl>
            {channel.lastErrorMessage && (
              <p className="rounded-lg bg-tomato/10 px-3 py-2 text-[11px] text-danger-ink">
                Último error ({formatWhen(channel.lastErrorAt)} · {channel.lastErrorCode}): {channel.lastErrorMessage}
              </p>
            )}
            <p className="text-[11px] text-soft">
              “Conectado” significa que Meta confirmó el número; tener credenciales guardadas no basta. “Recibiendo eventos” significa que en los
              últimos 7 días llegó al menos un evento real de Meta para este número.
            </p>
            {canManage && <ChannelActions id={channel.id} disconnected={disconnected} hasToken={channel.hasToken} />}
          </Card>

          <section className="space-y-2">
            <Eyebrow>Configuración</Eyebrow>
            <ChannelSettingsForm
              channelId={channel.id}
              canManage={canManage}
              options={options}
              initial={{
                label: channel.label,
                usage: channel.usage,
                defaultAgentId: channel.defaultAgentId,
                defaultProductId: channel.defaultProductId,
                defaultFlowId: channel.defaultFlowId,
                aiEnabled: channel.aiEnabled,
                aiSchedule: channel.aiSchedule,
                attentionTimezone: channel.attentionTimezone,
                attentionStartMinute: channel.attentionStartMinute,
                attentionEndMinute: channel.attentionEndMinute,
                attentionDays: channel.attentionDays,
                noProductBehavior: channel.noProductBehavior,
                fallbackUserId: channel.fallbackUserId,
              }}
            />
          </section>

          {canManage && !disconnected && (
            <section className="space-y-2">
              <Eyebrow>Probar envío autorizado</Eyebrow>
              <Card className="p-5">
                <TestSend channelId={channel.id} recipients={recipients.map((item) => ({ ...item, windowEndsAt: item.windowEndsAt?.toISOString() ?? null }))} />
              </Card>
            </section>
          )}

          <section className="space-y-2">
            <Eyebrow>Actividad y errores</Eyebrow>
            <Card className="divide-y divide-line">
              {channel.activity.length === 0 ? (
                <p className="p-4 text-xs text-soft">Sin actividad registrada.</p>
              ) : (
                channel.activity.map((entry) => {
                  const detail = activityDetail(entry.metadata);
                  return (
                    <div key={entry.id} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-carbon">{ACTION_LABEL[entry.action] ?? entry.action}</p>
                        {detail && <p className="text-[11px] text-graphite">{detail}</p>}
                      </div>
                      <p className="shrink-0 text-[11px] text-soft">
                        {formatWhen(entry.createdAt)}{entry.actorId ? ` · ${names.get(entry.actorId) ?? 'Equipo'}` : ' · Sistema'}
                      </p>
                    </div>
                  );
                })
              )}
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
