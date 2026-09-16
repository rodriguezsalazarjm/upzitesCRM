import Link from 'next/link';
import { MessageSquare, PlugZap } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { requireCurrentUser } from '@/lib/auth';
import { listConversations } from '@/lib/conversations';
import { prisma } from '@/lib/prisma';
import { cn } from '@/lib/utils';
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
  AI_ACTIVE: 'bg-violet-50 text-violet-700',
  HUMAN_ACTIVE: 'bg-emerald-50 text-emerald-700',
  WAITING: 'bg-amber-50 text-amber-700',
  PAUSED: 'bg-slate-100 text-slate-600',
  CLOSED: 'bg-slate-100 text-slate-500',
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
      <div className="flex shrink-0 gap-1.5 overflow-x-auto border-b bg-white px-3 py-2 sm:px-6">
        {CHANNEL_FILTERS.map((option) => (
          <Link
            key={option}
            href={option === 'ALL' ? '/inbox' : `/inbox?channel=${option}`}
            className={cn(
              'shrink-0 rounded-full px-3 py-1 text-xs font-medium',
              activeChannel === option ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            {option === 'ALL' ? 'Todos' : CHANNEL_LABEL[option]}
          </Link>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-6">
        {showWhatsAppBanner && (
          <Card className="border-0 bg-blue-50 shadow-sm">
            <CardContent className="flex items-start gap-3 p-5">
              <PlugZap className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Todavia no hay un numero de WhatsApp conectado
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Conecta el numero del cliente desde{' '}
                  <Link href="/integraciones" className="font-medium text-blue-700 underline">
                    Integraciones
                  </Link>
                  . Hasta entonces esta bandeja permanece vacia.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {conversations.length === 0 && !showWhatsAppBanner && (
          <Card className="border-0 shadow-sm">
            <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
              <MessageSquare className="h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">Sin conversaciones todavia</p>
              <p className="text-xs text-slate-500">
                Apareceran aqui apenas alguien escriba al numero conectado.
              </p>
            </CardContent>
          </Card>
        )}

        {conversations.map((conversation) => (
          <Link key={conversation.id} href={`/inbox/${conversation.id}`} className="block">
            <Card className="border-0 shadow-sm transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {conversation.contactName}
                    </p>
                    {conversation.unreadCount > 0 && (
                      <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {conversation.unreadCount}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-slate-500">
                    {conversation.lastMessagePreview ?? 'Sin mensajes'}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400">{conversation.contactPhone}</p>
                </div>

                <div className="flex max-w-[42%] shrink-0 flex-col items-end gap-1.5 sm:max-w-none">
                  <ChannelBadge channel={conversation.channel} className="text-[9px]" />
                  <span
                    className={cn(
                      'max-w-full truncate rounded-md px-2 py-0.5 text-[10px] font-semibold',
                      MODE_STYLE[conversation.mode],
                    )}
                  >
                    {MODE_LABEL[conversation.mode]}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {relativeTime(conversation.lastMessageAt)}
                  </span>
                  {!conversation.withinServiceWindow && (
                    <Badge variant="outline" className="text-[9px]">
                      Fuera de ventana 24h
                    </Badge>
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
