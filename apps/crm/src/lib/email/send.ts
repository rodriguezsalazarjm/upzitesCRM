import { createHash, randomBytes } from 'node:crypto';
import {
  ConsentChannel,
  EmailDomainStatus,
  EmailMessageStatus,
  EmailProviderKind,
  EmailTemplateStatus,
  SendCategory,
} from '../../../generated/prisma/client';
import type { ModelProvider } from '../agents/provider';
import { recordAudit } from '../domain/audit';
import { checkAllowance, hasCapability, recordUsage } from '../billing/usage';
import { evaluateSend, recordSend, type ContactPolicy } from '../marketing/policy';
import { prisma } from '../prisma';
import { createResendProvider } from './resend';
import { createScriptedProvider } from './scripted';
import type { EmailProvider } from './provider';
import {
  appendUnsubscribe,
  parseAiSlots,
  personalizeSlots,
  renderTemplate,
  UNSUBSCRIBE_PLACEHOLDER,
  withUnsubscribeUrl,
  type RenderedEmail,
} from './templates';

/**
 * Camino de envio de un email.
 *
 * Todo email del CRM sale por aca —campanas, journeys y avisos operativos— y
 * eso es intencional: las comprobaciones que impiden un envio indebido
 * (consentimiento, supresion, silencio, frecuencia, dominio verificado, enlace
 * de baja) viven en un solo lugar en vez de repartidas por cada llamador.
 *
 * Un envio bloqueado NO es un error. Devuelve SKIPPED con el motivo, se guarda
 * como evidencia y el journey sigue. Un error de red si es un error y se
 * reintenta.
 */

export function providerFor(kind: EmailProviderKind): EmailProvider {
  return kind === EmailProviderKind.RESEND ? createResendProvider() : createScriptedProvider();
}

/**
 * Proveedor configurado por entorno. Si RESEND_API_KEY falta se usa el
 * guionado: la integracion queda inactiva y el CRM sigue en pie, que es la
 * regla de la spec para integraciones sin configurar.
 */
export function defaultProvider(): EmailProvider {
  const configured = (process.env.EMAIL_PROVIDER ?? '').trim().toUpperCase();
  if (configured === 'RESEND') {
    const resend = createResendProvider();
    if (resend.configured) return resend;
  }
  return createScriptedProvider();
}

export function generateUnsubscribeToken() {
  return randomBytes(32).toString('base64url');
}

export function hashUnsubscribeToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function baseUrl() {
  return (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
}

export type SendResult =
  | { status: 'SENT'; emailMessageId: string; providerMessageId: string }
  | { status: 'SKIPPED'; reason: string; retryAt?: Date }
  | { status: 'FAILED'; emailMessageId: string; error: string; retryable: boolean };

export type SendEmailRequest = {
  workspaceId: string;
  contactId: string;
  category?: SendCategory;
  /** Plantilla publicada del workspace. Alternativa a subject/body sueltos. */
  templateKey?: string;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  variables?: Record<string, string>;
  campaignId?: string | null;
  journeyId?: string | null;
  provider?: EmailProvider;
  modelProvider?: ModelProvider | null;
  policy?: ContactPolicy;
  now?: Date;
  /** Solo para envios pedidos por una persona desde la interfaz. */
  ignoreQuietHours?: boolean;
  actorId?: string | null;
};

/**
 * Direccion de envio del workspace.
 *
 * Lo promocional exige dominio VERIFICADO. Enviar marketing desde un dominio no
 * verificado quema la reputacion de todos los clientes del proveedor, asi que
 * no es una decision que se le deje a cada campana.
 */
async function resolveSender(workspaceId: string, category: SendCategory) {
  const domains = await prisma.emailDomain.findMany({
    where: { workspaceId },
    orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
  });

  if (domains.length === 0) return { ok: false as const, reason: 'NO_SENDER_DOMAIN' };

  const verified = domains.find((domain) => domain.status === EmailDomainStatus.VERIFIED);

  if (category === SendCategory.PROMOTIONAL && !verified) {
    return { ok: false as const, reason: 'DOMAIN_NOT_VERIFIED' };
  }

  const domain = verified ?? domains[0];
  const from = domain.fromEmail ?? `no-reply@${domain.domain}`;

  return { ok: true as const, from, fromName: domain.fromName, provider: domain.provider };
}

export async function sendEmail(request: SendEmailRequest): Promise<SendResult> {
  const now = request.now ?? new Date();
  const category = request.category ?? SendCategory.PROMOTIONAL;

  const contact = await prisma.contact.findFirst({
    where: { id: request.contactId, workspaceId: request.workspaceId },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  if (!contact) return { status: 'SKIPPED', reason: 'NOT_FOUND' };
  if (!contact.email) return { status: 'SKIPPED', reason: 'NO_IDENTIFIER' };

  const sender = await resolveSender(request.workspaceId, category);
  if (!sender.ok) return { status: 'SKIPPED', reason: sender.reason };

  // Fase 9: el plan tiene que incluir email, y quedar cupo del mes.
  //
  // Lo operacional se exime del cupo por lo mismo que se exime de los topes de
  // frecuencia: un aviso de compra no es marketing, y bloquearlo por haber
  // agotado una cuota de campanas seria romper una venta ya hecha.
  if (category === SendCategory.PROMOTIONAL) {
    if (!(await hasCapability(request.workspaceId, 'EMAIL'))) {
      return { status: 'SKIPPED', reason: 'PLAN_WITHOUT_EMAIL' };
    }

    const quota = await checkAllowance({ workspaceId: request.workspaceId, metric: 'emails' });
    if (!quota.allowed) return { status: 'SKIPPED', reason: 'EMAIL_QUOTA_EXCEEDED' };
  }

  // Consentimiento, supresion, quiet hours y topes: una sola puerta.
  const decision = await evaluateSend({
    workspaceId: request.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.EMAIL,
    category,
    now,
    policy: request.policy,
    ignoreQuietHours: request.ignoreQuietHours,
  });

  if (!decision.allowed) {
    return { status: 'SKIPPED', reason: decision.reason, retryAt: decision.retryAt };
  }

  // --- Contenido ---
  let template: { id: string; subject: string; bodyHtml: string; bodyText: string; aiSlots: unknown } | null =
    null;

  if (request.templateKey) {
    const found = await prisma.emailTemplate.findFirst({
      where: {
        workspaceId: request.workspaceId,
        key: request.templateKey,
        status: EmailTemplateStatus.PUBLISHED,
      },
      select: { id: true, subject: true, bodyHtml: true, bodyText: true, aiSlots: true },
    });

    // Igual que las reglas de precio de la Fase 7: solo se usa lo publicado.
    if (!found) return { status: 'SKIPPED', reason: 'TEMPLATE_NOT_PUBLISHED' };
    template = found;
  }

  const subject = template?.subject ?? request.subject;
  const bodyHtml = template?.bodyHtml ?? request.bodyHtml;
  const bodyText = template?.bodyText ?? request.bodyText;

  if (!subject || !bodyHtml || !bodyText) {
    return { status: 'SKIPPED', reason: 'NO_CONTENT' };
  }

  const slots = parseAiSlots(template?.aiSlots);
  const personalization = await personalizeSlots({
    slots,
    context: {
      nombre: contact.firstName,
      apellido: contact.lastName,
      ...(request.variables ?? {}),
    },
    provider: request.modelProvider ?? null,
  });

  const values = {
    nombre: contact.firstName,
    apellido: contact.lastName,
    ...(request.variables ?? {}),
    ...personalization.values,
    // El marcador de baja se resuelve a si mismo para sobrevivir al render: de
    // otro modo `fillPlaceholders` lo borraria por no tener valor, y una
    // plantilla que coloca el enlace a mano se quedaria sin el.
    unsubscribe_url: UNSUBSCRIBE_PLACEHOLDER,
  };

  let rendered: RenderedEmail = renderTemplate({ subject, bodyHtml, bodyText }, values);

  const token = generateUnsubscribeToken();
  const unsubscribeUrl = `${baseUrl()}/baja/${token}`;

  // El enlace de baja se agrega aca y no en la plantilla: es obligatorio en todo
  // email promocional y no puede depender de que alguien lo recuerde.
  //
  // Se inserta un MARCADOR, no la URL. Lo que se guarda en la base lleva el
  // marcador; la URL real solo se arma para el proveedor. De otro modo el token
  // quedaria en claro dentro del cuerpo guardado y de nada serviria guardar solo
  // su hash. Una plantilla puede colocar el marcador donde quiera.
  if (category === SendCategory.PROMOTIONAL && !rendered.html.includes(UNSUBSCRIBE_PLACEHOLDER)) {
    rendered = appendUnsubscribe(rendered, UNSUBSCRIBE_PLACEHOLDER);
  }

  const delivered =
    category === SendCategory.PROMOTIONAL ? withUnsubscribeUrl(rendered, unsubscribeUrl) : rendered;

  const provider = request.provider ?? providerFor(sender.provider);

  const message = await prisma.emailMessage.create({
    data: {
      workspaceId: request.workspaceId,
      contactId: contact.id,
      campaignId: request.campaignId ?? null,
      journeyId: request.journeyId ?? null,
      templateId: template?.id ?? null,
      toEmail: contact.email,
      fromEmail: sender.from,
      subject: rendered.subject,
      bodyHtml: rendered.html,
      bodyText: rendered.text,
      category,
      provider: provider.kind,
      status: EmailMessageStatus.QUEUED,
      unsubscribeTokenHash:
        category === SendCategory.PROMOTIONAL ? hashUnsubscribeToken(token) : null,
    },
  });

  const result = await provider.send({
    from: sender.from,
    fromName: sender.fromName,
    to: contact.email,
    subject: delivered.subject,
    html: delivered.html,
    text: delivered.text,
    listUnsubscribeUrl: category === SendCategory.PROMOTIONAL ? unsubscribeUrl : null,
    // El id del mensaje es la clave: un reintento del worker no duplica el envio.
    idempotencyKey: message.id,
  });

  if (!result.ok) {
    await prisma.emailMessage.update({
      where: { id: message.id },
      data: {
        status: EmailMessageStatus.FAILED,
        failedAt: new Date(),
        lastError: result.error,
      },
    });

    return {
      status: 'FAILED',
      emailMessageId: message.id,
      error: result.error,
      retryable: result.retryable,
    };
  }

  await prisma.emailMessage.update({
    where: { id: message.id },
    data: {
      status: EmailMessageStatus.SENT,
      sentAt: new Date(),
      providerMessageId: result.providerMessageId,
    },
  });

  await recordSend({
    workspaceId: request.workspaceId,
    contactId: contact.id,
    channel: ConsentChannel.EMAIL,
    category,
    campaignId: request.campaignId ?? null,
    journeyId: request.journeyId ?? null,
  });

  // Solo lo promocional consume cupo de plan. Un aviso de compra no se le
  // descuenta a nadie de su cuota de marketing.
  if (category === SendCategory.PROMOTIONAL) {
    await recordUsage({
      workspaceId: request.workspaceId,
      provider: provider.kind,
      metric: 'emails',
      quantity: 1,
      referenceType: 'EmailMessage',
      referenceId: message.id,
    });
  }

  if (personalization.rejected.length > 0) {
    // Se audita porque significa que el modelo intento salirse del template.
    await recordAudit({
      workspaceId: request.workspaceId,
      actorId: request.actorId,
      action: 'email.personalization_rejected',
      entity: 'EmailMessage',
      entityId: message.id,
      metadata: { rejected: personalization.rejected },
    });
  }

  return {
    status: 'SENT',
    emailMessageId: message.id,
    providerMessageId: result.providerMessageId,
  };
}
