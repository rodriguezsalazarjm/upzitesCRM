import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getConversationDetail } from '@/lib/conversations';
import { formatCurrency } from '@/lib/mock-data';
import { ConversationClient, type ThreadMessage } from './conversation-client';

export const dynamic = 'force-dynamic';

const TEMPERATURE_STYLE: Record<string, 'success' | 'warning' | 'outline'> = {
  HOT: 'success',
  WARM: 'warning',
  COLD: 'outline',
};

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conversation = await getConversationDetail(id);

  if (!conversation) notFound();

  const contact = conversation.contact;
  const messages: ThreadMessage[] = conversation.messages.map((message) => ({
    id: message.id,
    direction: message.direction,
    senderType: message.senderType,
    senderName: null,
    text: message.text,
    status: message.status,
    errorMessage: message.errorMessage,
    createdAt: message.createdAt.toISOString(),
  }));

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-16 items-center gap-3 border-b bg-white px-6">
          <Link href="/inbox" className="text-slate-400 hover:text-slate-700">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900">
              {contact.firstName} {contact.lastName}
            </p>
            <p className="truncate text-[11px] text-slate-400">
              {contact.phone} · via {conversation.channel.displayPhoneNumber}
            </p>
          </div>
        </div>

        <ConversationClient
          conversationId={conversation.id}
          mode={conversation.mode}
          withinServiceWindow={conversation.withinServiceWindow}
          messages={messages}
        />
      </div>

      <aside className="hidden w-[280px] shrink-0 overflow-y-auto border-l bg-white p-5 xl:block">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Contacto</p>
        <p className="mt-2 text-sm font-semibold text-slate-900">
          {contact.firstName} {contact.lastName}
        </p>
        <p className="text-xs text-slate-500">{contact.email ?? 'Sin email'}</p>

        <div className="mt-4 space-y-2 text-xs">
          <Row label="Ciclo de vida" value={contact.lifecycleStatus} />
          <Row label="Intencion" value={contact.buyingIntent} />
          <Row label="Valor" value={formatCurrency(contact.value)} />
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Temperatura</span>
            <Badge variant={TEMPERATURE_STYLE[contact.temperature] ?? 'outline'}>
              {contact.temperature} · {contact.leadScore}
            </Badge>
          </div>
          <Row label="Fuente" value={contact.source ?? 'Sin fuente'} />
          <Row
            label="Asignada a"
            value={conversation.assignee?.name ?? 'Sin asignar'}
          />
        </div>

        <Link
          href={`/contactos/${contact.id}`}
          className="mt-5 block rounded-lg border py-2 text-center text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Ver ficha completa
        </Link>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="truncate font-medium text-slate-800">{value}</span>
    </div>
  );
}
