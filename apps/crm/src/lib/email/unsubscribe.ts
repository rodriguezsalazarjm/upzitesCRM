import {
  ConsentChannel,
  EmailEventType,
  EmailMessageStatus,
  SuppressionReason,
} from '../../../generated/prisma/client';
import { revokeConsent } from '../domain/consent';
import { prisma } from '../prisma';
import { hashUnsubscribeToken } from './send';

/**
 * Baja desde el enlace del email.
 *
 * El enlace lleva un token aleatorio y en la base solo vive su hash, igual que
 * el enlace del PDF de la Fase 7: quien lea la tabla no obtiene con que dar de
 * baja a nadie.
 *
 * El token identifica el mensaje concreto, no solo al contacto. Eso permite
 * responder "que campana provoco esta baja", que es la metrica que dice si una
 * campana esta quemando la lista.
 */

export type UnsubscribeTarget = {
  emailMessageId: string;
  workspaceId: string;
  contactId: string | null;
  campaignId: string | null;
  toEmail: string;
  alreadyUnsubscribed: boolean;
};

export async function resolveUnsubscribeToken(token: string): Promise<UnsubscribeTarget | null> {
  if (!token || token.length < 16) return null;

  const message = await prisma.emailMessage.findUnique({
    where: { unsubscribeTokenHash: hashUnsubscribeToken(token) },
    select: {
      id: true,
      workspaceId: true,
      contactId: true,
      campaignId: true,
      toEmail: true,
      unsubscribedAt: true,
    },
  });

  if (!message) return null;

  return {
    emailMessageId: message.id,
    workspaceId: message.workspaceId,
    contactId: message.contactId,
    campaignId: message.campaignId,
    toEmail: message.toEmail,
    alreadyUnsubscribed: message.unsubscribedAt !== null,
  };
}

export type UnsubscribeResult = {
  ok: boolean;
  alreadyUnsubscribed: boolean;
  email: string;
};

/**
 * Aplica la baja.
 *
 * Es idempotente: volver a abrir el enlace no vuelve a contar la baja ni
 * duplica nada. Los clientes de correo prefetchean enlaces, asi que esto no es
 * teorico.
 */
export async function applyUnsubscribe(input: {
  token: string;
  source?: string;
}): Promise<UnsubscribeResult | null> {
  const target = await resolveUnsubscribeToken(input.token);
  if (!target) return null;

  if (target.alreadyUnsubscribed) {
    return { ok: true, alreadyUnsubscribed: true, email: target.toEmail };
  }

  const now = new Date();

  // Revoca el consentimiento, suprime la direccion, cancela las acciones
  // programadas y saca al contacto de los journeys de email. Todo eso vive en
  // revokeConsent para que la baja signifique lo mismo venga de donde venga.
  if (target.contactId) {
    await revokeConsent({
      workspaceId: target.workspaceId,
      contactId: target.contactId,
      channel: ConsentChannel.EMAIL,
      reason: SuppressionReason.USER_REQUEST,
      source: input.source ?? 'enlace de baja',
    });
  }

  await prisma.emailMessage.update({
    where: { id: target.emailMessageId },
    data: { status: EmailMessageStatus.UNSUBSCRIBED, unsubscribedAt: now },
  });

  await prisma.emailEvent.create({
    data: {
      workspaceId: target.workspaceId,
      emailMessageId: target.emailMessageId,
      type: EmailEventType.UNSUBSCRIBED,
      dedupeKey: `unsubscribe:${target.emailMessageId}`,
      occurredAt: now,
      payload: { source: input.source ?? 'enlace de baja' },
    },
  });

  if (target.campaignId) {
    await prisma.campaign.update({
      where: { id: target.campaignId },
      data: { unsubscribedCount: { increment: 1 } },
    });
  }

  return { ok: true, alreadyUnsubscribed: false, email: target.toEmail };
}
