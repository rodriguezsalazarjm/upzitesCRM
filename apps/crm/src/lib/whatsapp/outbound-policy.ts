export const OUTBOUND_ORIGINS = [
  'HUMAN',
  'AI',
  'AUTOMATION',
  'JOURNEY',
  'TRANSACTIONAL',
] as const;

export type OutboundOrigin = (typeof OUTBOUND_ORIGINS)[number];

export type OutboxMessagePayload = {
  messageId: string;
  conversationId: string;
  to: string;
  text: string;
  origin?: OutboundOrigin;
  conversationLockVersion?: number;
};

export function isOutboundOrigin(value: unknown): value is OutboundOrigin {
  return typeof value === 'string' && OUTBOUND_ORIGINS.includes(value as OutboundOrigin);
}

export function inferOutboundOrigin(
  payload: Pick<OutboxMessagePayload, 'origin'>,
  senderType: string,
): OutboundOrigin {
  if (isOutboundOrigin(payload.origin)) return payload.origin;
  if (senderType === 'USER') return 'HUMAN';
  if (senderType === 'AI') return 'AI';

  // Los mensajes SYSTEM antiguos no declaraban procedencia. Se consideran
  // automatización para que una toma humana prefiera cancelar antes que enviar.
  return 'AUTOMATION';
}

export function pausesOnHumanTakeover(origin: OutboundOrigin) {
  return origin === 'AI' || origin === 'AUTOMATION' || origin === 'JOURNEY';
}

export function isOriginCompatibleWithSender(origin: OutboundOrigin, senderType: string) {
  if (senderType === 'USER') return origin === 'HUMAN';
  if (senderType === 'AI') return origin === 'AI';
  if (senderType === 'SYSTEM') {
    return origin === 'AUTOMATION' || origin === 'JOURNEY' || origin === 'TRANSACTIONAL';
  }
  return false;
}

export function shouldCancelAutomaticSend(input: {
  origin: OutboundOrigin;
  queuedLockVersion?: number;
  currentLockVersion: number;
  conversationMode: string;
}) {
  if (!pausesOnHumanTakeover(input.origin)) return false;
  if (input.conversationMode !== 'AI_ACTIVE') return true;

  // Los payloads anteriores a esta política no tienen generación. Pueden
  // enviarse mientras la IA siga activa; takeover los cancela por procedencia.
  return (
    input.queuedLockVersion !== undefined &&
    input.queuedLockVersion !== input.currentLockVersion
  );
}
