/**
 * QA visual del Punto 7 (solo base de pruebas): crea en el workspace indicado un
 * lead con conversacion de WhatsApp que consulto hace 40 minutos y no compro, y
 * corre el barrido de seguimientos con el reloj real. No envia nada: el outbox
 * no se procesa y la estrategia de la QA esta en modo prueba.
 *
 *   node scripts/visual/run.mjs ... (se ejecuta con tsx y la base crm_pruebas)
 */
import { ConsentChannel, MessageDirection, MessageSenderType, WhatsAppChannelStatus } from '../../generated/prisma/client';
import { encryptSecret } from '../../src/lib/crypto';
import { grantConsent } from '../../src/lib/domain/consent';
import { scanFollowUpEntries } from '../../src/lib/followups/triggers';
import { prisma } from '../../src/lib/prisma';

const [workspaceId, journeyId] = process.argv.slice(2);
if (!workspaceId || !journeyId) throw new Error('Uso: p7-lead.ts <workspaceId> <journeyId>');

const now = new Date();
const inquiryAt = new Date(now.getTime() - 40 * 60_000);
await prisma.journey.update({ where: { id: journeyId }, data: { publishedAt: new Date(now.getTime() - 2 * 3_600_000) } });

const channel =
  (await prisma.whatsAppChannel.findFirst({ where: { workspaceId } })) ??
  (await prisma.whatsAppChannel.create({
    data: { workspaceId, wabaId: `waba-qa-p7-${workspaceId}`, phoneNumberId: `phone-qa-p7-${workspaceId}`, displayPhoneNumber: '+56900000007', status: WhatsAppChannelStatus.CONNECTED, accessTokenEncrypted: encryptSecret('token-qa-p7'), lastHealthCheckAt: now, webhookSubscribedAt: now },
  }));

const contact = await prisma.contact.create({ data: { workspaceId, firstName: 'Lucía', lastName: 'Lead QA P7', phone: `+569700${String(now.getTime()).slice(-5)}` } });
await grantConsent({ workspaceId, contactId: contact.id, channel: ConsentChannel.WHATSAPP, source: 'qa-visual-p7' });
const conversation = await prisma.conversation.create({
  data: { workspaceId, channelId: channel.id, contactId: contact.id, mode: 'AI_ACTIVE', status: 'OPEN', lastInboundAt: inquiryAt, lastOutboundAt: new Date(inquiryAt.getTime() + 60_000), lastMessageAt: new Date(inquiryAt.getTime() + 60_000), customerServiceWindowEndsAt: new Date(inquiryAt.getTime() + 24 * 3_600_000) },
});
await prisma.message.create({ data: { workspaceId, conversationId: conversation.id, direction: MessageDirection.INBOUND, senderType: MessageSenderType.CONTACT, type: 'TEXT', text: 'Hola, ¿cuánto cuesta y cómo lo compro?', status: 'DELIVERED', createdAt: inquiryAt } });
await prisma.message.create({ data: { workspaceId, conversationId: conversation.id, direction: MessageDirection.OUTBOUND, senderType: MessageSenderType.AI, type: 'TEXT', text: 'Te cuento los detalles y el enlace de pago.', status: 'SENT', createdAt: new Date(inquiryAt.getTime() + 60_000) } });

const scan = await scanFollowUpEntries(200, now);
const enrollment = await prisma.journeyEnrollment.findUnique({ where: { journeyId_contactId: { journeyId, contactId: contact.id } } });
console.log(JSON.stringify({ contactId: contact.id, conversationId: conversation.id, scan, enrollment: enrollment && { id: enrollment.id, status: enrollment.status, nextRunAt: enrollment.nextRunAt } }));
await prisma.$disconnect();
