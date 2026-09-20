import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ui/status-badge';
import { ChannelLabel, channelIdentityLabel } from '@/components/channels/channel-badge';
import { ContactContext, type ContextContact } from '@/components/inbox/contact-context';
import { CHANNEL_ISSUE_LABEL } from '@/components/inbox/conversation-meta';
import { ConversationList, CHANNEL_FILTERS } from '@/components/inbox/conversation-list';
import { InboxShell } from '@/components/inbox/inbox-shell';
import { getConversationDetail, listConversations } from '@/lib/conversations';
import { prisma } from '@/lib/prisma';
import { getInitials } from '@/lib/utils';
import type { Channel } from '../../../../../generated/prisma/client';
import { ConversationClient, type ThreadMessage } from './conversation-client';

export const dynamic = 'force-dynamic';

function customFieldsOf(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => ['string', 'number', 'boolean'].includes(typeof item))
      .map(([key, item]) => [key, String(item)]),
  );
}

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ channel?: string }>;
}) {
  const { id } = await params;
  const { channel: channelParam } = await searchParams;
  const activeChannel = CHANNEL_FILTERS.includes(channelParam as Channel) ? (channelParam as Channel | 'ALL') : 'ALL';

  // Primero el detalle: abrir la conversación la marca como leída y la lista
  // (consultada después) ya refleja el contador en cero.
  const conversation = await getConversationDetail(id);

  if (!conversation) notFound();

  const [conversations, openOpportunity] = await Promise.all([
    listConversations(activeChannel === 'ALL' ? {} : { channel: activeChannel }),
    prisma.opportunity.findFirst({
      where: { contactId: conversation.contact.id, workspaceId: conversation.workspaceId, status: 'OPEN' },
      orderBy: { updatedAt: 'desc' },
      include: { stage: { select: { name: true } } },
    }),
  ]);

  const contact = conversation.contact;
  const contactName = `${contact.firstName} ${contact.lastName}`.trim();
  const identity = channelIdentityLabel(
    conversation.channelType,
    conversation.channel,
    conversation.channelAccount,
    contact.phone,
  );

  const channelStatus =
    conversation.channelType === 'WHATSAPP' ? conversation.channel?.status : conversation.channelAccount?.status;
  const channelIssue = channelStatus && channelStatus !== 'CONNECTED' ? channelStatus : null;

  const messages: ThreadMessage[] = conversation.messages.map((message) => ({
    id: message.id,
    direction: message.direction,
    senderType: message.senderType,
    senderName: null,
    text: message.text,
    type: message.type,
    status: message.status,
    errorMessage: message.errorMessage,
    createdAt: message.createdAt.toISOString(),
    // El archivo no viaja al cliente: solo lo necesario para pintarlo y para
    // pedirlo despues por una ruta que vuelve a comprobar la sesion.
    media: message.media
      ? {
          id: message.media.id,
          status: message.media.status,
          kind: message.media.kind,
          mimeType: message.media.mimeType,
          fileName: message.media.fileName,
          sizeBytes: message.media.sizeBytes,
          inline:
            message.media.contentConfirmed &&
            ['image/', 'audio/', 'video/'].some((family) =>
              (message.media?.mimeType ?? '').startsWith(family),
            ),
        }
      : null,
  }));

  const contextContact: ContextContact = {
    id: contact.id,
    name: contactName,
    email: contact.email,
    phone: contact.phone,
    lifecycleStatus: contact.lifecycleStatus,
    temperature: contact.temperature,
    buyingIntent: contact.buyingIntent,
    leadScore: contact.leadScore,
    value: contact.value,
    source: contact.source,
    tags: contact.tags,
    lastActivityAt: contact.lastActivityAt?.toISOString() ?? null,
    createdAt: contact.createdAt.toISOString(),
    customFields: customFieldsOf(contact.customFields),
  };

  return (
    <InboxShell
      list={
        <ConversationList
          conversations={conversations}
          activeId={conversation.id}
          activeChannel={activeChannel}
          showWhatsAppBanner={false}
          headingLevel="h2"
        />
      }
      header={
        <>
          <Link
            href="/inbox"
            aria-label="Volver a conversaciones"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-graphite transition-colors hover:bg-ivory hover:text-carbon lg:hidden"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </Link>
          <Avatar className="hidden h-10 w-10 shrink-0 sm:flex">
            <AvatarFallback className="bg-ivory text-xs font-bold text-graphite">
              {getInitials(contactName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-bold leading-tight text-carbon">{contactName}</h1>
            <p className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-ash">
              <ChannelLabel channel={conversation.channelType} />
              <span aria-hidden>·</span>
              <span className="truncate">{identity}</span>
            </p>
          </div>
          {channelIssue && (
            <StatusBadge
              className="hidden shrink-0 md:inline-flex"
              tone={channelIssue === 'DISCONNECTED' || channelIssue === 'REAUTH_REQUIRED' ? 'danger' : 'warning'}
            >
              {CHANNEL_ISSUE_LABEL[channelIssue] ?? 'Canal requiere atención'}
            </StatusBadge>
          )}
        </>
      }
      context={
        <ContactContext
          contact={contextContact}
          channel={conversation.channelType}
          channelIdentity={identity}
          assigneeName={conversation.assignee?.name ?? null}
          opportunity={
            openOpportunity
              ? {
                  title: openOpportunity.title,
                  stageName: openOpportunity.stage.name,
                  value: openOpportunity.value,
                  probability: openOpportunity.probability,
                }
              : null
          }
        />
      }
    >
      <ConversationClient
        conversationId={conversation.id}
        mode={conversation.mode}
        withinServiceWindow={conversation.withinServiceWindow}
        messages={messages}
      />
    </InboxShell>
  );
}
