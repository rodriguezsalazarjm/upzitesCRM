import {
  AlertKind,
  AlertSeverity,
  ActivityType,
  ConversationStatus,
  MessageSenderType,
  SendCategory,
} from '../../../generated/prisma/client';
import { raiseAlert } from '../billing/alerts';
import { recordAudit } from '../domain/audit';
import { sendEmail } from '../email/send';
import { prisma } from '../prisma';
import { queueOutboundMessage } from '../whatsapp/outbound';

/**
 * Envio de la entrega digital al cliente.
 *
 * Hasta ahora el pago generaba los accesos y los devolvia al llamador, que se
 * limitaba a contarlos: **el cliente pagaba y no recibia nada**. Los enlaces
 * quedaban en la respuesta de una funcion y se perdian.
 *
 * Tres decisiones:
 *
 *  1. **Se intentan los dos canales**, no uno con respaldo. WhatsApp es donde
 *     ocurrio la conversacion; el email es donde el cliente va a buscar el
 *     acceso dentro de tres meses. Que llegue por los dos no molesta a nadie.
 *  2. **Es OPERACIONAL**: no pide consentimiento promocional, no consume topes
 *     de marketing y no espera al amanecer. Alguien acaba de pagar.
 *  3. **Si no se pudo por ningun canal, se levanta un aviso.** Un enlace que no
 *     salio y nadie sabe que no salio es el peor de los tres resultados: el
 *     cliente pagó, no tiene su producto, y el negocio cree que si.
 *
 * Sobre guardar el enlace en el mensaje: el texto enviado queda en `messages` y
 * en `email_messages`, con el token dentro. Es deliberado y distinto del caso
 * del token de baja (B12): alli el token era una credencial para actuar EN
 * nombre del destinatario y guardarlo anulaba el hash que se guardaba al lado;
 * aqui el enlace ES el producto entregado, y el registro de lo que se envio es
 * justamente la evidencia que hace falta si el cliente dice que no le llego.
 */

export type DeliveryLink = { token: string | null; assetName: string; url: string | null };

export type NotifyResult = {
  whatsapp: boolean;
  email: boolean;
  /** Ningun canal funciono. Se levanto un aviso para que lo mande una persona. */
  needsHuman: boolean;
};

function buildMessage(links: DeliveryLink[], workspaceName: string) {
  const lineas = links
    .filter((link) => link.url)
    .map((link) => `• ${link.assetName}: ${link.url}`);

  return [
    `Listo, tu compra en ${workspaceName} esta confirmada.`,
    '',
    lineas.length === 1 ? 'Este es tu acceso:' : 'Estos son tus accesos:',
    ...lineas,
    '',
    'Guarda este mensaje: el enlace es personal y no se vuelve a enviar solo.',
  ].join('\n');
}

function buildHtml(links: DeliveryLink[], workspaceName: string) {
  const items = links
    .filter((link) => link.url)
    .map(
      (link) =>
        `<li><strong>${link.assetName}</strong>: <a href="${link.url}">${link.url}</a></li>`,
    )
    .join('');

  return [
    `<p>Listo, tu compra en ${workspaceName} esta confirmada.</p>`,
    `<ul>${items}</ul>`,
    '<p>Guarda este correo: el enlace es personal y no se vuelve a enviar solo.</p>',
  ].join('');
}

export async function notifyDigitalDelivery(input: {
  workspaceId: string;
  orderId: string;
  contactId: string | null;
  links: DeliveryLink[];
}): Promise<NotifyResult> {
  const enviables = input.links.filter((link) => link.url);

  if (enviables.length === 0 || !input.contactId) {
    return { whatsapp: false, email: false, needsHuman: enviables.length > 0 };
  }

  const workspace = await prisma.workspace.findUniqueOrThrow({
    where: { id: input.workspaceId },
    select: { name: true },
  });

  const texto = buildMessage(enviables, workspace.name);

  // --- WhatsApp ---
  let porWhatsapp = false;

  const conversacion = await prisma.conversation.findFirst({
    where: {
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      status: { not: ConversationStatus.CLOSED },
    },
    orderBy: { lastMessageAt: 'desc' },
    select: { id: true },
  });

  if (conversacion) {
    try {
      await queueOutboundMessage({
        workspaceId: input.workspaceId,
        conversationId: conversacion.id,
        text: texto,
        senderType: MessageSenderType.SYSTEM,
      });
      porWhatsapp = true;
    } catch (error) {
      // No se corta: todavia queda el email. Se registra para poder explicarlo.
      console.error('delivery_notify_whatsapp_failed', { orderId: input.orderId, error });
    }
  }

  // --- Email ---
  let porEmail = false;

  const resultado = await sendEmail({
    workspaceId: input.workspaceId,
    contactId: input.contactId,
    category: SendCategory.OPERATIONAL,
    subject: `Tu compra en ${workspace.name}`,
    bodyHtml: buildHtml(enviables, workspace.name),
    bodyText: texto,
  });

  porEmail = resultado.status === 'SENT';

  const needsHuman = !porWhatsapp && !porEmail;

  await recordAudit({
    workspaceId: input.workspaceId,
    action: 'order.delivery_notified',
    entity: 'CustomerOrder',
    entityId: input.orderId,
    metadata: {
      whatsapp: porWhatsapp,
      email: porEmail,
      emailReason: resultado.status === 'SENT' ? null : resultado.status === 'SKIPPED' ? resultado.reason : resultado.error,
      assets: enviables.length,
    },
  });

  if (needsHuman) {
    await raiseAlert({
      workspaceId: input.workspaceId,
      kind: AlertKind.INTEGRATION_DOWN,
      severity: AlertSeverity.CRITICAL,
      title: 'Una entrega digital no se pudo enviar',
      detail:
        'El cliente pago y su acceso quedo generado, pero no salio ni por WhatsApp ni por email. ' +
        'Reenvialo desde Pedidos.',
      dedupeKey: `delivery-not-sent:${input.orderId}`,
    });

    await prisma.activity.create({
      data: {
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        type: ActivityType.CALL,
        title: 'Enviar acceso de la compra a mano',
        description:
          'La entrega digital no pudo salir por ningun canal. El acceso esta generado: reenvialo desde Pedidos.',
        dueAt: new Date(),
      },
    });
  } else {
    // Si antes fallo y ahora salio, el aviso se cierra solo.
    await prisma.workspaceAlert.updateMany({
      where: {
        workspaceId: input.workspaceId,
        dedupeKey: `delivery-not-sent:${input.orderId}`,
        resolvedAt: null,
      },
      data: { resolvedAt: new Date() },
    });
  }

  return { whatsapp: porWhatsapp, email: porEmail, needsHuman };
}
