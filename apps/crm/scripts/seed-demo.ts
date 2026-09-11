/**
 * Seed de demostracion.
 *
 * Crea un workspace completo y coherente para mostrar el producto o arrancar un
 * piloto: contactos con historia, una conversacion real, un pedido pagado con
 * entrega digital, una cotizacion aprobada y consumo medido.
 *
 * Tres cosas que lo hacen util y no un adorno:
 *
 *  - **Es idempotente.** Volver a correrlo borra el workspace anterior y crea
 *    uno limpio. Una demo a medio sembrar es peor que ninguna.
 *  - **No inventa nada que el producto no pueda producir.** Los totales salen
 *    del motor de cotizacion, la entrega digital sale del pago, el consumo sale
 *    de `recordUsage`. Si el seed muestra algo, el producto lo hace.
 *  - **No nombra ningun rubro.** La beta es multivertical: el negocio de la
 *    demo vende "servicios a medida" y "un curso", que es lo mas generico que
 *    se puede ser sin dejar de ser concreto.
 *
 * Uso, desde apps/crm:
 *   pnpm exec tsx scripts/seed-demo.ts [email] [password]
 */
import 'dotenv/config';
import {
  BusinessType,
  ConsentChannel,
  ConversationMode,
  ConversationStatus,
  EmailDomainStatus,
  EmailTemplateStatus,
  JourneyStatus,
  LeadTemperature,
  LifecycleStatus,
  MessageDirection,
  MessageSenderType,
  MessageStatus,
  OrderStatus,
  PaymentStatus,
  PricingRuleSetStatus,
  WhatsAppChannelStatus,
} from '../generated/prisma/client';
import { prisma } from '../src/lib/prisma';
import { createCustomerWorkspace, ensureBetaPlans } from '../src/lib/subscription';
import { grantConsent } from '../src/lib/domain/consent';
import { recalculateContactScore } from '../src/lib/domain/scoring';
import { recordUsage } from '../src/lib/billing/usage';
import { approveQuote, createQuote } from '../src/lib/quotes/service';
import { processOrderPayment } from '../src/lib/commerce/payment-webhook';
import { activateForTests } from './fixtures/workspace';

const EMAIL = process.argv[2] ?? 'demo@upzites.test';
const PASSWORD = process.argv[3] ?? 'demo-upzites-1234';
const BASE_URL = process.env.NEXT_PUBLIC_CRM_BASE_URL ?? 'http://localhost:3001';

const stamp = Date.now();

console.log('\n== Seed de demostracion ==\n');

// --- Limpieza del anterior ---------------------------------------------------
const previo = await prisma.user.findFirst({ where: { email: EMAIL } });
if (previo) {
  await prisma.workspace.deleteMany({ where: { id: previo.workspaceId } });
  console.log('Workspace anterior eliminado.');
}

await ensureBetaPlans();

const { workspace, user } = await createCustomerWorkspace({
  companyName: 'Demo Upzites',
  ownerName: 'Equipo Demo',
  email: EMAIL,
  password: PASSWORD,
});

console.log(`Workspace creado: ${workspace.name} (${workspace.slug})`);

// --- Perfil y canales --------------------------------------------------------
await prisma.workspaceProfile.update({
  where: { workspaceId: workspace.id },
  data: {
    businessType: BusinessType.SERVICES,
    about: 'Negocio de demostracion: vende servicios a medida y un curso digital.',
    policies: 'Cotizaciones validas por 15 dias. Cambios y devoluciones dentro de 10 dias.',
    shippingInfo: 'Los servicios se agendan tras aceptar la cotizacion.',
  },
});

await prisma.messagingPolicy.update({
  where: { workspaceId: workspace.id },
  data: { timezone: 'America/Santiago' },
});

const channel = await prisma.whatsAppChannel.create({
  data: {
    workspaceId: workspace.id,
    wabaId: `demo-waba-${stamp}`,
    phoneNumberId: `demo-phone-${stamp}`,
    displayPhoneNumber: '+56 9 1234 5678',
    businessName: 'Demo Upzites',
    status: WhatsAppChannelStatus.CONNECTED,
  },
});

await prisma.emailDomain.create({
  data: {
    workspaceId: workspace.id,
    domain: 'demo.upzites.test',
    status: EmailDomainStatus.VERIFIED,
    fromName: 'Demo Upzites',
    fromEmail: 'hola@demo.upzites.test',
    verifiedAt: new Date(),
  },
});

await prisma.integration.updateMany({
  where: { workspaceId: workspace.id, provider: 'MERCADO_PAGO' },
  data: { status: 'CONNECTED' },
});

// --- Catalogo ----------------------------------------------------------------
const curso = await prisma.product.create({
  data: {
    workspaceId: workspace.id,
    name: 'Curso de introduccion',
    description: 'Acceso inmediato al material completo.',
    type: 'DIGITAL',
    status: 'ACTIVE',
    variants: { create: [{ name: 'Acceso completo', priceClp: 39000, isDefault: true }] },
    assets: {
      create: [{
        workspaceId: workspace.id,
        name: 'Material del curso',
        kind: 'LINK',
        target: 'https://demo.upzites.test/material',
      }],
    },
  },
  include: { variants: true },
});

const ruleSet = await prisma.pricingRuleSet.create({
  data: {
    workspaceId: workspace.id,
    serviceKey: 'servicio-a-medida',
    name: 'Servicio a medida',
    description: 'Se cotiza por superficie, unidades y dificultad de acceso.',
    version: 1,
    status: PricingRuleSetStatus.PUBLISHED,
    publishedAt: new Date(),
    validityDays: 15,
    disclaimer: 'Valor referencial sujeto a visita tecnica.',
    intakeSchema: {
      fields: [
        { key: 'superficie', label: 'Superficie', type: 'number', required: true, unit: 'm2', min: 0.1 },
        { key: 'unidades', label: 'Unidades', type: 'number', required: true },
        { key: 'dificultad', label: 'Dificultad de acceso', type: 'select', required: true, options: ['normal', 'alta'] },
      ],
    } as never,
    rules: {
      components: [
        { key: 'superficie', label: 'Superficie', type: 'PER_UNIT', unitPriceClp: 12000, quantityFrom: 'superficie' },
        { key: 'unidades', label: 'Unidades', type: 'PER_UNIT', unitPriceClp: 18000, quantityFrom: 'unidades' },
        { key: 'visita', label: 'Visita tecnica', type: 'FIXED', amountClp: 25000 },
        {
          key: 'dificil',
          label: 'Recargo por acceso dificil',
          type: 'SURCHARGE',
          percent: 15,
          when: { match: 'ALL', rules: [{ field: 'dificultad', operator: 'eq', value: 'alta' }] },
        },
      ],
      minimumClp: 90000,
      roundToClp: 1000,
    } as never,
  },
});

console.log('Catalogo: 1 curso digital y 1 servicio cotizable.');

// --- Contactos con historia --------------------------------------------------
type Semilla = {
  nombre: string;
  apellido: string;
  temperatura: LeadTemperature;
  ciclo: LifecycleStatus;
  diasSinActividad: number;
  etiquetas?: string[];
};

const semillas: Semilla[] = [
  { nombre: 'Ana', apellido: 'Perez', temperatura: LeadTemperature.HOT, ciclo: LifecycleStatus.QUALIFIED, diasSinActividad: 0 },
  { nombre: 'Bruno', apellido: 'Silva', temperatura: LeadTemperature.WARM, ciclo: LifecycleStatus.LEAD, diasSinActividad: 2 },
  { nombre: 'Carla', apellido: 'Rojas', temperatura: LeadTemperature.COLD, ciclo: LifecycleStatus.LEAD, diasSinActividad: 12 },
  { nombre: 'Diego', apellido: 'Mena', temperatura: LeadTemperature.HOT, ciclo: LifecycleStatus.QUALIFIED, diasSinActividad: 1 },
  { nombre: 'Elena', apellido: 'Castro', temperatura: LeadTemperature.WARM, ciclo: LifecycleStatus.CUSTOMER, diasSinActividad: 5 },
  { nombre: 'Felipe', apellido: 'Munoz', temperatura: LeadTemperature.COLD, ciclo: LifecycleStatus.LOST, diasSinActividad: 40, etiquetas: ['perdido-precio'] },
];

const contactos = [];

for (const [index, semilla] of semillas.entries()) {
  const contacto = await prisma.contact.create({
    data: {
      workspaceId: workspace.id,
      firstName: semilla.nombre,
      lastName: semilla.apellido,
      email: `${semilla.nombre.toLowerCase()}@cliente.demo`,
      phone: `+5691000000${index}`,
      temperature: semilla.temperatura,
      lifecycleStatus: semilla.ciclo,
      source: index % 2 === 0 ? 'WhatsApp' : 'Formulario web',
      tags: semilla.etiquetas ?? [],
      lastActivityAt: new Date(Date.now() - semilla.diasSinActividad * 86_400_000),
    },
  });

  await grantConsent({
    workspaceId: workspace.id,
    contactId: contacto.id,
    channel: ConsentChannel.WHATSAPP,
    source: 'demo',
  });
  await grantConsent({
    workspaceId: workspace.id,
    contactId: contacto.id,
    channel: ConsentChannel.EMAIL,
    source: 'demo',
  });

  contactos.push(contacto);
}

console.log(`Contactos: ${contactos.length}, con consentimiento en ambos canales.`);

// --- Una conversacion con historia -------------------------------------------
const conversacion = await prisma.conversation.create({
  data: {
    workspaceId: workspace.id,
    channelId: channel.id,
    contactId: contactos[0].id,
    mode: ConversationMode.AI_ACTIVE,
    status: ConversationStatus.OPEN,
    lastInboundAt: new Date(),
    lastMessageAt: new Date(),
  },
});

const dialogo: { direccion: MessageDirection; quien: MessageSenderType; texto: string }[] = [
  { direccion: MessageDirection.INBOUND, quien: MessageSenderType.CONTACT, texto: 'Hola, necesito una cotizacion' },
  { direccion: MessageDirection.OUTBOUND, quien: MessageSenderType.AI, texto: 'Hola Ana. Con gusto. Para calcularlo necesito la superficie, cuantas unidades y la dificultad de acceso.' },
  { direccion: MessageDirection.INBOUND, quien: MessageSenderType.CONTACT, texto: '12 metros, 3 unidades, acceso normal' },
  { direccion: MessageDirection.OUTBOUND, quien: MessageSenderType.AI, texto: 'Perfecto, lo calculo y lo revisa el equipo antes de enviartelo.' },
];

for (const [index, mensaje] of dialogo.entries()) {
  await prisma.message.create({
    data: {
      workspaceId: workspace.id,
      conversationId: conversacion.id,
      direction: mensaje.direccion,
      senderType: mensaje.quien,
      text: mensaje.texto,
      status: MessageStatus.DELIVERED,
      createdAt: new Date(Date.now() - (dialogo.length - index) * 60_000),
    },
  });
}

console.log('Conversacion de ejemplo con 4 mensajes.');

// --- Una cotizacion real, calculada por el motor -----------------------------
const cotizacion = await createQuote({
  workspaceId: workspace.id,
  serviceKey: ruleSet.serviceKey,
  inputs: { superficie: 12, unidades: 3, dificultad: 'normal' },
  contactId: contactos[0].id,
  conversationId: conversacion.id,
});

await prisma.quote.update({
  where: { id: cotizacion.id },
  data: { status: 'PENDING_HUMAN_REVIEW' },
});

const aprobada = await approveQuote({
  workspaceId: workspace.id,
  quoteId: cotizacion.id,
  reviewer: { id: user.id, role: 'OWNER' },
});

console.log(`Cotizacion ${cotizacion.number} por $${cotizacion.total.toLocaleString('es-CL')} (calculada por el motor).`);
console.log(`  PDF: ${BASE_URL}/q/${aprobada.token}`);

// --- Un pedido pagado con entrega digital ------------------------------------
const pedido = await prisma.customerOrder.create({
  data: {
    workspaceId: workspace.id,
    contactId: contactos[4].id,
    status: OrderStatus.PENDING_PAYMENT,
    total: 39000,
    subtotal: 39000,
    customerEmail: contactos[4].email,
    customerName: `${contactos[4].firstName} ${contactos[4].lastName}`,
    lines: {
      create: [{
        variantId: curso.variants[0].id,
        name: curso.name,
        unitPrice: 39000,
        quantity: 1,
        total: 39000,
      }],
    },
  },
});

const entrega = await processOrderPayment({
  orderId: pedido.id,
  externalPaymentId: `demo-pago-${stamp}`,
  status: PaymentStatus.APPROVED,
  rawStatus: 'approved',
  amount: 39000,
  currency: 'CLP',
  baseUrl: BASE_URL,
});

console.log(`Pedido pagado: ${entrega.delivered ?? 0} entrega(s) digital(es) creada(s).`);

// El enlace de entrega se muestra una sola vez, al crearse. Aqui se informa el
// camino para recuperarlo en vez de inventar un token que no existe.
console.log('  El enlace de entrega se reenvia desde /pedidos si hace falta.');

// --- Plantilla y journey listos ----------------------------------------------
await prisma.emailTemplate.create({
  data: {
    workspaceId: workspace.id,
    key: 'seguimiento',
    name: 'Seguimiento de cotizacion',
    subject: 'Hola {{nombre}}, quedamos atentos',
    bodyHtml: '<p>Hola {{nombre}}. Te dejamos la cotizacion a mano por si quieres avanzar.</p>',
    bodyText: 'Hola {{nombre}}. Te dejamos la cotizacion a mano por si quieres avanzar.',
    variables: ['nombre'],
    status: EmailTemplateStatus.PUBLISHED,
    publishedAt: new Date(),
  },
});

await prisma.journey.updateMany({
  where: { workspaceId: workspace.id, key: 'cotizacion-pendiente' },
  data: { status: JourneyStatus.PUBLISHED, publishedAt: new Date() },
});

// --- Consumo medido ----------------------------------------------------------
await recordUsage({
  workspaceId: workspace.id,
  provider: 'openai',
  metric: 'ai_cost_clp',
  quantity: 8400,
  costClp: 3200,
});
await recordUsage({
  workspaceId: workspace.id,
  provider: 'whatsapp',
  metric: 'conversations',
  quantity: 37,
});

// --- Scoring con razones reales ----------------------------------------------
for (const contacto of contactos) {
  await recalculateContactScore({ workspaceId: workspace.id, contactId: contacto.id });
}

// --- El agente, publicado ----------------------------------------------------
// Sin publicar, el agente no responde: una demo donde la IA esta muda no
// muestra el producto.
const agente = await prisma.agentDefinition.findFirstOrThrow({
  where: { workspaceId: workspace.id },
  include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
});

await prisma.agentVersion.update({
  where: { id: agente.versions[0].id },
  data: { status: 'PUBLISHED', publishedAt: new Date() },
});

// --- Activacion --------------------------------------------------------------
await activateForTests(workspace.id);

console.log('\nWorkspace activo y listo para mostrar.');
console.log(`\n  Entrar en:  ${BASE_URL}/login`);
console.log(`  Usuario:    ${EMAIL}`);
console.log(`  Contrasena: ${PASSWORD}\n`);

await prisma.$disconnect();
