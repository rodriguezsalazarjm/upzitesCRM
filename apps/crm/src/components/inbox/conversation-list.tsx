import Link from 'next/link';
import { MessageSquare, PlugZap } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs } from '@/components/ui/tabs';
import { ChannelLabel, CHANNEL_ICON, CHANNEL_LABEL } from '@/components/channels/channel-badge';
import { MODE_SHORT, MODE_TONE, relativeTime } from '@/components/inbox/conversation-meta';
import type { ConversationListItem } from '@/lib/conversations';
import { cn, getInitials } from '@/lib/utils';
import type { Channel } from '../../../generated/prisma/client';

export const CHANNEL_FILTERS: Array<Channel | 'ALL'> = ['ALL', 'WHATSAPP', 'INSTAGRAM', 'MESSENGER', 'TIKTOK'];

/**
 * Columna de conversaciones (server component). Se usa igual en /inbox y en
 * /inbox/[id]: la fila activa se marca con `aria-current` y el filtro de canal
 * viaja en la URL, así que abrir una conversación no lo pierde.
 */
export function ConversationList({
  conversations,
  activeId,
  activeChannel,
  showWhatsAppBanner,
  headingLevel = 'h1',
  className,
}: {
  conversations: ConversationListItem[];
  activeId?: string;
  activeChannel: Channel | 'ALL';
  showWhatsAppBanner: boolean;
  headingLevel?: 'h1' | 'h2';
  className?: string;
}) {
  const Heading = headingLevel;
  const base = activeId ? `/inbox/${activeId}` : '/inbox';
  const suffix = activeChannel === 'ALL' ? '' : `?channel=${activeChannel}`;

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="shrink-0 space-y-3 pb-3 pl-16 pr-4 pt-5 md:pl-5 md:pr-5">
        <div className="flex items-end justify-between gap-3">
          <Heading className="type-display text-[36px] text-carbon">Inbox</Heading>
          <p className="tabular pb-1 text-xs text-ash" aria-live="polite">
            {conversations.length} {conversations.length === 1 ? 'conversación' : 'conversaciones'}
          </p>
        </div>
        <Tabs
          semantics="filter"
          ariaLabel="Filtrar por canal"
          value={activeChannel}
          items={CHANNEL_FILTERS.map((option) => {
            if (option === 'ALL') return { value: option, label: 'Todos', href: base };
            const Icon = CHANNEL_ICON[option];
            return {
              value: option,
              label: CHANNEL_LABEL[option],
              title: CHANNEL_LABEL[option],
              // Renderizado aquí: este es un Server Component y un componente
              // (función) no puede cruzar a Tabs, que es client.
              iconElement: <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />,
              iconOnly: true,
              href: `${base}?channel=${option}`,
            };
          })}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {showWhatsAppBanner && (
          <div className="mx-4 mb-3 flex items-start gap-3 rounded-2xl bg-ink p-4 text-canvas">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lime text-carbon">
              <PlugZap className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-bold">Todavia no hay un numero de WhatsApp conectado</p>
              <p className="mt-1 text-xs text-ink-muted">
                Conecta el numero del cliente desde{' '}
                <Link href="/integraciones" className="font-semibold text-lime underline underline-offset-4">
                  Integraciones
                </Link>
                . Hasta entonces esta bandeja permanece vacia.
              </p>
            </div>
          </div>
        )}

        {conversations.length === 0 && !showWhatsAppBanner && (
          <div className="px-4">
            <EmptyState
              icon={MessageSquare}
              title="Sin conversaciones todavia"
              description="Apareceran aqui apenas alguien escriba al numero conectado."
            />
          </div>
        )}

        <nav aria-label="Conversaciones">
          <ul className="border-t border-line">
            {conversations.map((conversation) => {
              const active = conversation.id === activeId;
              return (
                <li key={conversation.id} className="border-b border-line">
                  <Link
                    href={`/inbox/${conversation.id}${suffix}`}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'flex items-start gap-3 border-l-[3px] px-4 py-3.5 outline-none transition-colors focus-visible:bg-ivory md:px-5',
                      active
                        ? 'border-l-electric bg-electric/[0.06]'
                        : 'border-l-transparent hover:bg-ivory/70',
                    )}
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-ivory text-xs font-bold text-graphite">
                        {getInitials(conversation.contactName)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p
                          className={cn(
                            'truncate text-sm text-carbon',
                            conversation.unreadCount > 0 ? 'font-bold' : 'font-semibold',
                          )}
                        >
                          {conversation.contactName}
                        </p>
                        <span className="shrink-0 text-[11px] text-ash">
                          {relativeTime(conversation.lastMessageAt)}
                        </span>
                      </div>

                      <div className="mt-0.5 flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-[13px] text-ash">
                          {conversation.lastMessagePreview ?? 'Sin mensajes'}
                        </p>
                        {conversation.unreadCount > 0 && (
                          <span className="tabular shrink-0 rounded-full bg-electric px-1.5 text-[11px] font-bold leading-[18px] text-white">
                            <span className="sr-only">Sin leer: </span>
                            {conversation.unreadCount}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <ChannelLabel channel={conversation.channel} />
                        <StatusBadge variant="dot" tone={MODE_TONE[conversation.mode] ?? 'neutral'} className="text-xs">
                          {MODE_SHORT[conversation.mode] ?? conversation.mode}
                        </StatusBadge>
                        {!conversation.withinServiceWindow && (
                          <span className="text-[11px] font-medium text-warning-ink">Fuera de ventana 24h</span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
