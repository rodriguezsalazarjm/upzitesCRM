import { readFileSync, writeFileSync } from 'node:fs';
import { prisma } from '../../src/lib/prisma';
import { createCustomerWorkspace } from '../../src/lib/subscription';
import { hashPassword } from '../../src/lib/password';
import { encryptSecret } from '../../src/lib/crypto';
import { grantConsent } from '../../src/lib/domain/consent';
import { createQuote, approveQuote } from '../../src/lib/quotes/service';
import { queueOutboundMessage } from '../../src/lib/whatsapp/outbound';
if (!(globalThis as Record<symbol, unknown>)[Symbol.for('upzites.visual.guard')]) throw Error('Usa visual:prepare.');
const credentials = JSON.parse(readFileSync('.local-visual/accounts.json', 'utf8'));
const emails = credentials.accounts as string[];
const existing = await prisma.user.findMany({ where: { email: { in: emails } }, include: { workspace: true } });
// Never reset anything except our explicitly named, dedicated visual fixtures.
for (const user of existing) {
  if (!['Visual Flow A', 'Visual Flow B'].includes(user.workspace.name)) throw Error('Cuenta de fixture ocupada por otro workspace.');
}
await prisma.workspace.deleteMany({ where: { id: { in: existing.map((u) => u.workspaceId) } } });
try {
  const A = await createCustomerWorkspace({ companyName: 'Visual Flow A', ownerName: 'Ana Owner A', email: emails[0], password: credentials.password });
  const B = await createCustomerWorkspace({ companyName: 'Visual Flow B', ownerName: 'Bruno Owner B', email: emails[2], password: credentials.password });
  const operator = await prisma.user.create({ data: { workspaceId: A.workspace.id, name: 'Olivia Operadora A', email: emails[1], passwordHash: hashPassword(credentials.password), role: 'SALES' } });
  const links: Record<string, string> = {};
  for (const [key, ws] of [['a', A], ['b', B]] as const) {
    await prisma.workspaceProfile.update({ where: { workspaceId: ws.workspace.id }, data: {
      businessType: key === 'a' ? 'SERVICES' : 'INFOPRODUCT', about: 'Datos ficticios para recorrido local.', policies: 'Atención de prueba; no se realizan cobros.',
    } });
    const channel = await prisma.whatsAppChannel.create({ data: { workspaceId: ws.workspace.id, wabaId: `visual-${key}`,
      phoneNumberId: `visual-${key}`, displayPhoneNumber: '+56900000000', status: 'CONNECTED',
      accessTokenEncrypted: encryptSecret('visual-test-token'), lastHealthCheckAt: new Date(), webhookSubscribedAt: new Date(),
    } });
    const contact = await prisma.contact.create({ data: { workspaceId: ws.workspace.id,
      firstName: key === 'a' ? 'Carla' : 'Diego', lastName: key === 'a' ? 'Cliente A' : 'Exclusivo B', phone: key === 'a' ? '+56900000001' : '+56900000002', email: `client-${key}@visual.test`,
    } });
    await grantConsent({ workspaceId: ws.workspace.id, contactId: contact.id, channel: 'WHATSAPP', source: 'fixture-visual-local' });
    const conversation = await prisma.conversation.create({ data: { workspaceId: ws.workspace.id, channelId: channel.id, contactId: contact.id,
      mode: 'AI_ACTIVE', status: 'OPEN', lastMessageAt: new Date(), lastInboundAt: new Date(), unreadCount: 1,
      customerServiceWindowEndsAt: new Date(Date.now() + 23 * 3600000),
      messages: { create: [{ workspaceId: ws.workspace.id, direction: 'INBOUND', senderType: 'CONTACT', status: 'DELIVERED', text: key === 'a' ? 'Hola, necesito una cotización para tres visitas de mantenimiento.' : 'Este mensaje solo pertenece al workspace B.' }] },
    } });
    links[`inbox_${key}`] = `/inbox/${conversation.id}`;
    const ruleSet = await prisma.pricingRuleSet.create({ data: { workspaceId: ws.workspace.id,
      serviceKey: 'visita-visual', name: `Visita técnica ${key.toUpperCase()}`, status: 'PUBLISHED', publishedAt: new Date(),
      intakeSchema: { fields: [{ key: 'cantidad', label: 'Cantidad de visitas', type: 'number', required: true, min: 1 }] },
      rules: { components: [{ key: 'visitas', label: 'Visitas', type: 'PER_UNIT', quantityFrom: 'cantidad', unitPriceClp: 25000 }] },
    } });
    const quote = await createQuote({ workspaceId: ws.workspace.id, serviceKey: ruleSet.serviceKey, inputs: { cantidad: 3 }, contactId: contact.id, conversationId: conversation.id, actorId: ws.user.id });
    links[`quote_${key}`] = `/cotizaciones/${quote.id}`;
    if (key === 'a') {
      const approved = await createQuote({ workspaceId: ws.workspace.id, serviceKey: ruleSet.serviceKey, inputs: { cantidad: 1 }, contactId: contact.id, actorId: ws.user.id });
      await approveQuote({ workspaceId: ws.workspace.id, quoteId: approved.id, reviewer: ws.user });
      const pending = await queueOutboundMessage({ workspaceId: ws.workspace.id, conversationId: conversation.id, origin: 'AI', senderType: 'AI', text: 'Respuesta automática pendiente: debe cancelarse al tomar el control.' });
      await prisma.outboxEvent.update({ where: { idempotencyKey: `message:${pending.id}` }, data: { availableAt: new Date(Date.now() + 86400000) } });
      // Keep onboarding incomplete: no successful simulator run yet.
      await prisma.agentVersion.updateMany({ where: { definition: { workspaceId: ws.workspace.id } }, data: { status: 'PUBLISHED', publishedAt: new Date() } });
    }
  }
  writeFileSync('.local-visual/fixtures.json', JSON.stringify({ workspaceA: A.workspace.id, workspaceB: B.workspace.id, ownerA: A.user.id, operatorA: operator.id, ownerB: B.user.id, links }, null, 2));
  console.log('Fixtures visuales preparados solo en crm_pruebas. Cuentas en .local-visual/accounts.json (ignorado).');
} finally { await prisma.$disconnect(); }
