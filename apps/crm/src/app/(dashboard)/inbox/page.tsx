import { MessagesSquare } from 'lucide-react';
import { ConversationList, CHANNEL_FILTERS } from '@/components/inbox/conversation-list';
import { requireCurrentUser } from '@/lib/auth';
import { listConversations } from '@/lib/conversations';
import { prisma } from '@/lib/prisma';
import type { Channel } from '../../../../generated/prisma/client';

export const dynamic = 'force-dynamic';

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
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <ConversationList
        conversations={conversations}
        activeChannel={activeChannel}
        showWhatsAppBanner={showWhatsAppBanner}
        className="w-full lg:w-[340px] lg:shrink-0 lg:border-r lg:border-line"
      />
      <div className="hidden min-w-0 flex-1 items-center justify-center lg:flex">
        <div className="max-w-xs text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-ivory text-ash">
            <MessagesSquare className="h-6 w-6" strokeWidth={1.5} aria-hidden />
          </span>
          <p className="text-base font-bold text-carbon">Elige una conversación</p>
          <p className="mt-1 text-sm text-ash">
            Verás aquí el hilo, el estado de la IA y el contexto del contacto.
          </p>
        </div>
      </div>
    </div>
  );
}
