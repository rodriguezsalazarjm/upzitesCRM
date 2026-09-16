import { MessageCircle, Camera, Send, Music2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Channel } from '../../../generated/prisma/client';

export const CHANNEL_LABEL: Record<Channel, string> = {
  WHATSAPP: 'WhatsApp',
  INSTAGRAM: 'Instagram',
  MESSENGER: 'Messenger',
  TIKTOK: 'TikTok',
};

// lucide-react no trae iconos de marca (Instagram/Facebook/TikTok): se usan
// iconos genericos que evocan cada canal en vez de un logo con licencia ajena.
const CHANNEL_ICON: Record<Channel, typeof MessageCircle> = {
  WHATSAPP: MessageCircle,
  INSTAGRAM: Camera,
  MESSENGER: Send,
  TIKTOK: Music2,
};

const CHANNEL_BADGE_CLASS: Record<Channel, string> = {
  WHATSAPP: 'bg-emerald-50 text-emerald-700',
  INSTAGRAM: 'bg-fuchsia-50 text-fuchsia-700',
  MESSENGER: 'bg-blue-50 text-blue-700',
  TIKTOK: 'bg-slate-100 text-slate-700',
};

/** Insignia visual del canal. Un solo lugar para el icono/color de cada uno. */
export function ChannelBadge({ channel, className = '' }: { channel: Channel; className?: string }) {
  const Icon = CHANNEL_ICON[channel];
  return (
    <Badge className={`flex shrink-0 items-center gap-1 ${CHANNEL_BADGE_CLASS[channel]} ${className}`}>
      <Icon className="h-3 w-3" />
      {CHANNEL_LABEL[channel]}
    </Badge>
  );
}

/**
 * Identidad legible del contacto EN ESE canal: telefono para WhatsApp,
 * nombre/handle de la cuenta conectada para los demas. Nunca asume que
 * `channel`/`channelAccount` esta presente (una conversacion solo llena la
 * columna que le corresponde segun `channelType`).
 */
export function channelIdentityLabel(
  channelType: Channel,
  channel: { displayPhoneNumber: string } | null,
  channelAccount: { displayName: string | null; externalAccountId: string } | null,
  phone: string | null,
) {
  if (channelType === 'WHATSAPP') {
    return `${phone ?? 'sin telefono'} · via ${channel?.displayPhoneNumber ?? 'WhatsApp'}`;
  }
  const accountLabel = channelAccount?.displayName ?? channelAccount?.externalAccountId ?? CHANNEL_LABEL[channelType];
  return `via ${accountLabel}`;
}
