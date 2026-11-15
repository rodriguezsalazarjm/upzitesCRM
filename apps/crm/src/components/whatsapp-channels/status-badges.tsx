import { Badge } from '@/components/ui/badge';
import {
  CHANNEL_STATUS_LABEL,
  WEBHOOK_STATUS_LABEL,
  type ChannelDisplayStatus,
  type WebhookDisplayStatus,
} from '@/lib/whatsapp/channel-settings';

export function ChannelStatusBadge({ status }: { status: ChannelDisplayStatus }) {
  const meta = CHANNEL_STATUS_LABEL[status];
  return <Badge variant={meta.tone}>{meta.label}</Badge>;
}

export function WebhookStatusBadge({ status }: { status: WebhookDisplayStatus }) {
  return <Badge variant={status === 'RECEIVING' ? 'success' : status === 'SUBSCRIBED' ? 'neutral' : 'outline'}>{WEBHOOK_STATUS_LABEL[status]}</Badge>;
}

export function formatWhen(value: Date | string | null | undefined) {
  if (!value) return 'Sin registro';
  return new Date(value).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
}
