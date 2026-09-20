import Link from 'next/link';
import { MessageSquare, PlugZap } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { requireCurrentUser } from '@/lib/auth';
import { listConversations } from '@/lib/conversations';
import { prisma } from '@/lib/prisma';
import { cn, getInitials } from '@/lib/utils';
import { ChannelBadge, CHANNEL_LABEL } from '@/components/channels/channel-badge';
import type { Channel } from '../../../../generated/prisma/client';

const CHANNEL_FILTERS: Array<Channel | 'ALL'> = ['ALL', 'WHATSAPP', 'INSTAGRAM', 'MESSENGER', 'TIKTOK'];

export const dynamic = 'force-dynamic';

const MODE_LABEL: Record<string, string> = {
  AI_ACTIVE: 'IA respondiendo',
  HUMAN_ACTIVE: 'Humano activo',
  WAITING: 'Esperando cliente',
  PAUSED: 'Pausada',
  CLOSED: 'Cerrada',
};

const MODE_STYLE: Record<string, string> = {
  AI_ACTIVE: 'bg-ink text-lime',
  HUMAN_ACTIVE: 'bg-electric/10 text-blue-700',
  WAITING: 'bg-solar/30 text-amber-700',
  PAUSED: 'bg-ivory text-slate-600',
  CLOSED: 'bg-ivory text-slate-500',
};

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string }>;
}) {
  const user = await requireCurrentUser();
  const { channel: channelParam } = await searchParams;
  const activeChannel = CHANNEL_FILTERS.includes(channelParam as Channel) ? (channelParam as Channel | 'ALL') : 'ALL';

  const [conversations, channelCount] = await Promise.all([
    listConversations(activeChannel === 'ALL' ? {} : { channel: activeChannel }),
    prisma.whatsAppChannel.count({
      where: { workspaceId: user.workspace.id, status: 'CONNECTED' },
    }),
  ]);

  const showWhatsAppBanner =
    channelCount === 0 && (activeChannel === 'ALL' || activeChannel === 'WHATSAPP');

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header title="Inbox" subtitle="Conversaciones de todos los canales del workspace" />
      <div className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-3 pt-1 sm:px-8">
        {CHANNEL_FILTERS.map((option) => (
          <Link
            key={option}
            href={option === 'ALL' ? '/inbox' : `/inbox?channel=${option}`}
            className={cn(
              'shrink-0 rounded-full border px-4 py-1.5 text-[13px] font-semibold transition-colors',
              activeChannel === option
                ? 'border-carbon bg-carbon text-canvas'
                : 'border-slate-300 bg-paper text-slate-600 hover:border-carbon hover:text-carbon',
            )}
          >
            {option === 'ALL' ? 'Todos' : CHANNEL_LABEL[option]}
          </Link>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-8 pt-1 sm:px-8">
        {showWhatsAppBanner && (
          <Card tone="ink">
            <CardContent className="flex items-start gap-4 p-6">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lime text-carbon">
                <PlugZap className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <div>
                <p className="text-base font-bold">
                  Todavia no hay un numero de WhatsApp conectado
                </p>
                <p className="mt-1 text-sm text-soft">
                  Conecta el numero del cliente desde{' '}
                  <Link href="/integraciones" className="font-semibold text-lime underline underline-offset-4">
                    Integraciones
                  </Link>
                  . Hasta entonces esta bandeja permanece vacia.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {conversations.length === 0 && !showWhatsAppBanner && (
          <EmptyState
            icon={MessageSquare}
            title="Sin conversaciones todavia"
            description="Apareceran aqui apenas alguien escriba al numero conectado."
          />
        )}

        {conversations.map((conversation) => (
          <Link key={conversation.id} href={`/inbox/${conversation.id}`} className="block">
            <Card className="transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="flex items-center gap-3 p-4 sm:gap-4 sm:p-5">
                <Avatar className="hidden h-11 w-11 sm:flex">
                  <AvatarFallback className="bg-ivory text-[13px] font-bold text-carbon">
                    {getInitials(conversation.contactName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[15px] font-bold text-carbon">
                      {conversation.contactName}
                    </p>
                    {conversation.unreadCount > 0 && (
                      <span className="rounded-full bg-electric px-2 py-0.5 text-[11px] font-bold text-white">
                        {conversation.unreadCount}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[13px] text-slate-600">
                    {conversation.lastMessagePreview ?? 'Sin mensajes'}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{conversation.contactPhone}</p>
                </div>

                <div className="flex max-w-[42%] shrink-0 flex-col items-end gap-1.5 sm:max-w-none">
                  <ChannelBadge channel={conversation.channel} />
                  <span
                    className={cn(
                      'max-w-full truncate rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                      MODE_STYLE[conversation.mode],
                    )}
                  >
                    {MODE_LABEL[conversation.mode]}
                  </span>
                  <span className="text-xs text-slate-500">
                    {relativeTime(conversation.lastMessageAt)}
                  </span>
                  {!conversation.withinServiceWindow && (
                    <Badge variant="outline">Fuera de ventana 24h</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
