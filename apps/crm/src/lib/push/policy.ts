export type PushEventKind =
  | 'HUMAN_ATTENTION'
  | 'ASSIGNED'
  | 'QUOTE_APPROVAL'
  | 'OPERATIONAL_ISSUE'
  | 'INCOMING_MESSAGE';

export type PushEvent = {
  workspaceId: string;
  kind: PushEventKind;
  dedupeKey: string;
  userId?: string | null;
  conversationId?: string;
  quoteId?: string;
};

export function recipientStrategy(event: PushEvent) {
  if (event.userId) return 'EXPLICIT' as const;
  if (event.kind === 'INCOMING_MESSAGE') return 'NONE' as const;
  return 'ADMINS' as const;
}

export function notificationForEvent(event: PushEvent) {
  const url = event.conversationId
    ? `/inbox/${encodeURIComponent(event.conversationId)}`
    : event.quoteId
      ? '/cotizaciones'
      : '/ops';

  const copy: Record<PushEventKind, { title: string; body: string }> = {
    HUMAN_ATTENTION: {
      title: 'Se necesita atención humana',
      body: 'Abre Upzites Flow para revisar la conversación.',
    },
    ASSIGNED: {
      title: 'Te asignaron una conversación',
      body: 'Abre Upzites Flow para atenderla.',
    },
    QUOTE_APPROVAL: {
      title: 'Hay una cotización por revisar',
      body: 'Abre Upzites Flow para aprobarla o pedir cambios.',
    },
    OPERATIONAL_ISSUE: {
      title: 'El CRM necesita atención',
      body: 'Abre Upzites Flow para revisar el problema.',
    },
    INCOMING_MESSAGE: {
      title: 'Llegó un mensaje nuevo',
      body: 'Abre Upzites Flow para leerlo.',
    },
  };

  return { ...copy[event.kind], url, tag: `crm:${event.kind}:${event.dedupeKey}` };
}
