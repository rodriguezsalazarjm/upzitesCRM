import {
  AutomationTrigger,
  ConsentChannel,
  ConsentStatus,
  ScheduledActionStatus,
  SuppressionReason,
  type Prisma,
} from '../../../generated/prisma/client';
import { emitDomainEvent } from '../automation/emit';
import { prisma } from '../prisma';
import { recordAudit, type Db } from './audit';

/**
 * Normaliza la identidad usada por la lista de supresion.
 *
 * Email: minusculas y sin espacios. Telefono: solo digitos y un `+` inicial,
 * para que "+56 9 1111 1111" y "+56911111111" sean la misma identidad.
 */
export function normalizeIdentifier(channel: ConsentChannel, raw: string) {
  const value = raw.trim();
  if (channel === ConsentChannel.EMAIL) return value.toLowerCase();
  const digits = value.replace(/[^\d+]/g, '');
  return digits.startsWith('+') ? `+${digits.slice(1).replace(/\D/g, '')}` : digits.replace(/\D/g, '');
}

/** Identidad del contacto en cada canal: email para EMAIL, telefono para el resto. */
function identifierFor(channel: ConsentChannel, contact: { email: string | null; phone: string | null }) {
  const raw = channel === ConsentChannel.EMAIL ? contact.email : contact.phone;
  return raw ? normalizeIdentifier(channel, raw) : null;
}

export type ConsentDecision = {
  allowed: boolean;
  reason: 'GRANTED' | 'NO_CONSENT' | 'REVOKED' | 'SUPPRESSED' | 'NO_IDENTIFIER' | 'NOT_FOUND';
};

/**
 * Decide si se puede contactar a alguien por un canal.
 *
 * Es la unica puerta que deben usar campañas, journeys y agentes antes de
 * enviar algo promocional. Politica: se requiere consentimiento explicito
 * (GRANTED); la ausencia de registro NO habilita el envio.
 */
export async function canContact(
  input: { workspaceId: string; contactId: string; channel: ConsentChannel },
  db: Db = prisma,
): Promise<ConsentDecision> {
  const contact = await db.contact.findFirst({
    where: { id: input.contactId, workspaceId: input.workspaceId },
    select: { id: true, email: true, phone: true },
  });

  if (!contact) return { allowed: false, reason: 'NOT_FOUND' };

  const identifier = identifierFor(input.channel, contact);
  if (!identifier) return { allowed: false, reason: 'NO_IDENTIFIER' };

  // La supresion manda sobre cualquier consentimiento: sobrevive al borrado del
  // contacto y a una reimportacion por CSV.
  const suppressed = await db.suppressionEntry.findUnique({
    where: {
      workspaceId_channel_identifier: {
        workspaceId: input.workspaceId,
        channel: input.channel,
        identifier,
      },
    },
    select: { id: true },
  });

  if (suppressed) return { allowed: false, reason: 'SUPPRESSED' };

  const consent = await db.contactChannelConsent.findUnique({
    where: { contactId_channel: { contactId: contact.id, channel: input.channel } },
    select: { status: true },
  });

  if (!consent) return { allowed: false, reason: 'NO_CONSENT' };
  if (consent.status === ConsentStatus.GRANTED) return { allowed: true, reason: 'GRANTED' };
  if (consent.status === ConsentStatus.REVOKED) return { allowed: false, reason: 'REVOKED' };
  if (consent.status === ConsentStatus.SUPPRESSED) return { allowed: false, reason: 'SUPPRESSED' };

  return { allowed: false, reason: 'NO_CONSENT' };
}

export type GrantInput = {
  workspaceId: string;
  contactId: string;
  channel: ConsentChannel;
  source: string;
  evidence?: Prisma.InputJsonValue;
  actorId?: string | null;
};

/**
 * Otorga consentimiento en un canal.
 *
 * Si la identidad esta suprimida NO se otorga: una reimportacion por CSV o un
 * formulario nuevo no pueden resucitar a alguien que pidio no ser contactado.
 */
export async function grantConsent(input: GrantInput, db: Db = prisma) {
  const contact = await db.contact.findFirst({
    where: { id: input.contactId, workspaceId: input.workspaceId },
    select: { id: true, email: true, phone: true },
  });

  if (!contact) return { granted: false, reason: 'NOT_FOUND' as const };

  const identifier = identifierFor(input.channel, contact);
  if (identifier) {
    const suppressed = await db.suppressionEntry.findUnique({
      where: {
        workspaceId_channel_identifier: {
          workspaceId: input.workspaceId,
          channel: input.channel,
          identifier,
        },
      },
      select: { id: true },
    });

    if (suppressed) {
      await recordAudit(
        {
          workspaceId: input.workspaceId,
          actorId: input.actorId,
          action: 'consent.grant_blocked_by_suppression',
          entity: 'Contact',
          entityId: contact.id,
          metadata: { channel: input.channel, source: input.source },
        },
        db,
      );
      return { granted: false, reason: 'SUPPRESSED' as const };
    }
  }

  const now = new Date();
  await db.contactChannelConsent.upsert({
    where: { contactId_channel: { contactId: contact.id, channel: input.channel } },
    create: {
      workspaceId: input.workspaceId,
      contactId: contact.id,
      channel: input.channel,
      status: ConsentStatus.GRANTED,
      source: input.source,
      evidence: input.evidence ?? undefined,
      grantedAt: now,
    },
    update: {
      status: ConsentStatus.GRANTED,
      source: input.source,
      evidence: input.evidence ?? undefined,
      grantedAt: now,
      revokedAt: null,
    },
  });

  await recordAudit(
    {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: 'consent.granted',
      entity: 'Contact',
      entityId: contact.id,
      metadata: { channel: input.channel, source: input.source },
    },
    db,
  );

  return { granted: true, reason: 'GRANTED' as const };
}

export type RevokeInput = {
  workspaceId: string;
  contactId: string;
  channel: ConsentChannel;
  reason?: SuppressionReason;
  source?: string;
  actorId?: string | null;
};

/**
 * Revoca el consentimiento de un canal y bloquea el envio de inmediato.
 *
 * Hace tres cosas de forma atomica: marca el consentimiento como REVOKED,
 * agrega la identidad a la lista de supresion (para que sobreviva al contacto)
 * y cancela las acciones programadas pendientes de ese contacto.
 */
export async function revokeConsent(input: RevokeInput) {
  const result = await prisma.$transaction(async (tx) => {
    const contact = await tx.contact.findFirst({
      where: { id: input.contactId, workspaceId: input.workspaceId },
      select: { id: true, email: true, phone: true },
    });

    if (!contact) return { revoked: false, suppressed: false, canceledActions: 0 };

    const now = new Date();

    await tx.contactChannelConsent.upsert({
      where: { contactId_channel: { contactId: contact.id, channel: input.channel } },
      create: {
        workspaceId: input.workspaceId,
        contactId: contact.id,
        channel: input.channel,
        status: ConsentStatus.REVOKED,
        source: input.source ?? 'opt-out',
        revokedAt: now,
      },
      update: {
        status: ConsentStatus.REVOKED,
        source: input.source ?? 'opt-out',
        revokedAt: now,
      },
    });

    const identifier = identifierFor(input.channel, contact);
    let suppressed = false;

    if (identifier) {
      await tx.suppressionEntry.upsert({
        where: {
          workspaceId_channel_identifier: {
            workspaceId: input.workspaceId,
            channel: input.channel,
            identifier,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          channel: input.channel,
          identifier,
          reason: input.reason ?? SuppressionReason.USER_REQUEST,
          notes: input.source ?? null,
        },
        update: {},
      });
      suppressed = true;
    }

    const canceled = await tx.scheduledAction.updateMany({
      where: {
        workspaceId: input.workspaceId,
        contactId: contact.id,
        status: ScheduledActionStatus.PENDING,
      },
      data: { status: ScheduledActionStatus.CANCELED, canceledAt: now },
    });

    await recordAudit(
      {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: 'consent.revoked',
        entity: 'Contact',
        entityId: contact.id,
        metadata: {
          channel: input.channel,
          reason: input.reason ?? SuppressionReason.USER_REQUEST,
          canceledActions: canceled.count,
        },
      },
      tx,
    );

    return { revoked: true, suppressed, canceledActions: canceled.count };
  });

  if (result.revoked) {
    await emitDomainEvent({
      workspaceId: input.workspaceId,
      trigger: AutomationTrigger.CONSENT_REVOKED,
      dedupeKey: `consent-revoked:${input.contactId}:${input.channel}`,
      contactId: input.contactId,
      context: { consent: { channel: input.channel } },
    });
  }

  return result;
}

export type SuppressInput = {
  workspaceId: string;
  channel: ConsentChannel;
  identifier: string;
  reason: SuppressionReason;
  notes?: string;
  actorId?: string | null;
};

/**
 * Suprime una identidad (email o telefono) sin necesidad de que exista un
 * contacto. Sirve para rebotes duros y quejas de spam que llegan por webhook
 * del proveedor de email.
 */
export async function suppressIdentifier(input: SuppressInput) {
  const identifier = normalizeIdentifier(input.channel, input.identifier);

  return prisma.$transaction(async (tx) => {
    await tx.suppressionEntry.upsert({
      where: {
        workspaceId_channel_identifier: {
          workspaceId: input.workspaceId,
          channel: input.channel,
          identifier,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        channel: input.channel,
        identifier,
        reason: input.reason,
        notes: input.notes ?? null,
      },
      update: { reason: input.reason, notes: input.notes ?? null },
    });

    // Si la identidad corresponde a contactos existentes, su consentimiento
    // pasa a SUPPRESSED para que la UI lo refleje sin recalcular nada.
    const contacts = await tx.contact.findMany({
      where:
        input.channel === ConsentChannel.EMAIL
          ? { workspaceId: input.workspaceId, email: identifier }
          : { workspaceId: input.workspaceId, phone: { not: null } },
      select: { id: true, email: true, phone: true },
    });

    const matched = contacts.filter((c) => identifierFor(input.channel, c) === identifier);

    for (const contact of matched) {
      await tx.contactChannelConsent.upsert({
        where: { contactId_channel: { contactId: contact.id, channel: input.channel } },
        create: {
          workspaceId: input.workspaceId,
          contactId: contact.id,
          channel: input.channel,
          status: ConsentStatus.SUPPRESSED,
          source: input.notes ?? 'suppression',
          revokedAt: new Date(),
        },
        update: { status: ConsentStatus.SUPPRESSED, revokedAt: new Date() },
      });
    }

    await recordAudit(
      {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: 'consent.suppressed',
        entity: 'SuppressionEntry',
        metadata: { channel: input.channel, reason: input.reason, matchedContacts: matched.length },
      },
      tx,
    );

    return { identifier, matchedContacts: matched.length };
  });
}
