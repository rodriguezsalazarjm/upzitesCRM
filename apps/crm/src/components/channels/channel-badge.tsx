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
export const CHANNEL_ICON: Record<Channel, typeof MessageCircle> = {
  WHATSAPP: MessageCircle,
  INSTAGRAM: Camera,
  MESSENGER: Send,
  TIKTOK: Music2,
};

/**
 * Insignia visual del canal: icono + nombre sobre superficie neutra, igual
 * para los cuatro canales — el color no es la identidad del canal, el icono
 * y el label sí. Antes cada canal tenía su propio fondo de marca
 * (emerald/fuchsia/blue/slate); se retira para seguir la misma gramática que
 * ya usa `ChannelLabel` y los nodos del Flow Builder ("icono + nombre + señal
 * discreta", nunca una card entera del color de la plataforma).
 */
export function ChannelBadge({ channel, className = '' }: { channel: Channel; className?: string }) {
  const Icon = CHANNEL_ICON[channel];
  return (
    <Badge variant="neutral" className={`flex shrink-0 items-center gap-1 ${className}`}>
      <Icon className="h-3 w-3" aria-hidden />
      {CHANNEL_LABEL[channel]}
    </Badge>
  );
}

/**
 * Canal reconocible por icono + nombre, sin superficie de color. Para listas y
 * cabeceras densas (Inbox); `ChannelBadge` queda para donde un chip tenga sentido.
 */
export function ChannelLabel({ channel, className = '' }: { channel: Channel; className?: string }) {
  const Icon = CHANNEL_ICON[channel];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-graphite ${className}`}>
      <Icon className="h-3.5 w-3.5 text-carbon" strokeWidth={1.75} aria-hidden />
      {CHANNEL_LABEL[channel]}
    </span>
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
