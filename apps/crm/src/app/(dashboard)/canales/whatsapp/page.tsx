import Link from 'next/link';
import { ChevronRight, MessageCircle } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Eyebrow } from '@/components/ui/eyebrow';
import { AddNumber } from '@/components/whatsapp-channels/add-number';
import { ChannelStatusBadge, WebhookStatusBadge, formatWhen } from '@/components/whatsapp-channels/status-badges';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { isEncryptionConfigured } from '@/lib/crypto';
import { USAGE_LABEL } from '@/lib/whatsapp/channel-settings';
import { listChannels } from '@/lib/whatsapp/channel-manager';
import { embeddedSignupConfig } from '@/lib/whatsapp/embedded-signup';

export const dynamic = 'force-dynamic';

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-soft">{label}</dt>
      <dd className="truncate text-xs font-semibold text-carbon">{value}</dd>
    </div>
  );
}

/** Canales → WhatsApp: los numeros del workspace y como agregar uno. */
export default async function WhatsAppChannelsPage() {
  const user = await requireCurrentUser();
  const canManage = canManageChannels(user.role);
  const channels = await listChannels(user.workspace.id);
  const signup = embeddedSignupConfig();
  const missingEnv = [
    !isEncryptionConfigured() && 'clave de cifrado de credenciales',
    !process.env.WHATSAPP_VERIFY_TOKEN && 'token de verificación del webhook (WHATSAPP_VERIFY_TOKEN)',
    !process.env.META_APP_SECRET && 'secreto de la app de Meta (META_APP_SECRET)',
  ].filter(Boolean);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="WhatsApp" subtitle="Canales · tus números de WhatsApp Business" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-5">
          {missingEnv.length > 0 && (
            <div className="rounded-xl border border-solar/50 bg-solar/10 p-3 text-xs text-warning-ink" role="status">
              Falta en el servidor: {missingEnv.join(', ')}. Sin esto los mensajes de Meta no se pueden recibir de forma segura.
            </div>
          )}

          <section className="space-y-2">
            <Eyebrow>Números ({channels.length})</Eyebrow>
            {channels.length === 0 ? (
              <Card className="flex items-center gap-3 p-5 text-sm text-graphite">
                <MessageCircle className="h-5 w-5 text-soft" strokeWidth={1.75} />
                Todavía no hay números conectados.
              </Card>
            ) : (
              <div className="space-y-3">
                {channels.map((channel) => (
                  <Link key={channel.id} href={`/canales/whatsapp/${channel.id}`} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric">
                    <Card className="space-y-3 p-4 transition-colors hover:border-carbon">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-carbon">{channel.label || channel.businessName || 'Número de WhatsApp'}</p>
                          <p className="text-xs text-graphite">{channel.displayPhoneNumber} · {USAGE_LABEL[channel.usage]}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <ChannelStatusBadge status={channel.displayStatus} />
                          <WebhookStatusBadge status={channel.webhookStatus} />
                          {channel.planLimitedAt && <Badge variant="warning">Limitado por el plan</Badge>}
                          <ChevronRight className="h-4 w-4 text-soft" />
                        </div>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                        <Fact label="WABA ID" value={channel.wabaId} />
                        <Fact label="Phone Number ID" value={channel.phoneNumberId} />
                        <Fact label="Agente IA" value={channel.aiEnabled ? channel.defaultAgent?.name ?? 'Agente de ventas' : 'IA desactivada'} />
                        <Fact label="Producto" value={channel.defaultProduct?.name ?? 'Sin producto'} />
                        <Fact label="Automatización" value={channel.defaultFlow?.name ?? 'Ninguna'} />
                        <Fact label="Última actividad" value={formatWhen(channel.lastInboundAt ?? channel.lastWebhookAt)} />
                        <Fact label="Recibidos (7 días)" value={channel.stats.received7d} />
                        <Fact label="Fallos de envío (7 días)" value={channel.stats.failed7d} />
                      </dl>
                      {channel.lastErrorMessage && (
                        <p className="rounded-lg bg-tomato/10 px-3 py-2 text-[11px] text-danger-ink">
                          Último error ({formatWhen(channel.lastErrorAt)}): {channel.lastErrorMessage}
                        </p>
                      )}
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <AddNumber config={signup} canManage={canManage} />
          {!canManage && <p className="text-[11px] text-soft">Solo el owner o un admin puede agregar o configurar números.</p>}
        </div>
      </div>
    </div>
  );
}
