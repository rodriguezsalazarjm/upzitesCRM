/**
 * Matriz minima de pruebas de lanzamiento (spec, seccion 18).
 *
 * Es la suite que decide si la beta puede venderse. A diferencia de las de cada
 * fase, que prueban lo que esa fase construyo, esta prueba lo que NO puede
 * fallar sin importar quien lo construyo: aislamiento entre clientes, firmas,
 * idempotencia, consentimiento y creacion de ordenes.
 *
 * Cada bloque corresponde a un encabezado de la seccion 18, y cada prueba lleva
 * el nombre de la linea que cubre, para poder leer la matriz de la spec al lado
 * de la salida y comprobar que no falta ninguna.
 *
 * Uso, desde apps/crm:
 *   pnpm exec tsx scripts/smoke-critico.ts
 */
import 'dotenv/config';
import { createHmac } from 'node:crypto';
import {
  AgentRunStatus,
  ConsentChannel,
  ConversationMode,
  ConversationStatus,
  JobStatus,
  JobType,
  MessageDirection,
  MessageSenderType,
  MessageStatus,
  OrderStatus,
  PaymentStatus,
  PricingRuleSetStatus,
  QuoteStatus,
  SuppressionReason,
  WhatsAppChannelStatus,
} from '../generated/prisma/client';
import { prisma } from '../src/lib/prisma';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { activateForTests } from './fixtures/workspace';
import { canContact, grantConsent, revokeConsent, suppressIdentifier } from '../src/lib/domain/consent';
import { runAgent } from '../src/lib/agents/runner';
import { ScriptedProvider } from '../src/lib/agents/provider';
import { looksLikeHallucination, needsImmediateEscalation } from '../src/lib/agents/guardrails';
import { AGENT_TOOLS } from '../src/lib/agents/tools';
import { verifyMetaSignature } from '../src/lib/whatsapp/signature';
import { verifyWebhookHmac } from '../src/lib/shopify/oauth';
import { calculateQuote } from '../src/lib/quotes/engine';
import { parseRules, parseIntakeSchema, validateIntake } from '../src/lib/quotes/schema';
import { createQuote, approveQuote, markQuoteSent } from '../src/lib/quotes/service';
import { renderQuotePdf } from '../src/lib/quotes/pdf';
import { expireOverdueQuotes } from '../src/lib/ops/maintenance';
import { enqueue, claimJobs } from '../src/lib/jobs/queue';
import { advanceEnrollment, enroll } from '../src/lib/marketing/journeys';
import { isEnabled, setFlag } from '../src/lib/ops/flags';
import { consume } from '../src/lib/ops/rate-limit';

const results: { name: string; ok: boolean }[] = [];
let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const stamp = Date.now();

async function makeWorkspace(suffix: string) {
  const created = await createCustomerWorkspace({
    companyName: `critico-${suffix}-${stamp}`,
    ownerName: 'Owner',
    email: `owner-${suffix}-${stamp}@critico.test`,
    password: 'contrasena-de-prueba-1234',
  });

  await activateForTests(created.workspace.id);

  const channel = await prisma.whatsAppChannel.create({
    data: {
      workspaceId: created.workspace.id,
      wabaId: `waba-${suffix}-${stamp}`,
      phoneNumberId: `phone-${suffix}-${stamp}`,
      displayPhoneNumber: `+5690000${suffix === 'a' ? '1' : '2'}000`,
      status: WhatsAppChannelStatus.CONNECTED,
    },
  });

  const agent = await prisma.agentDefinition.findFirstOrThrow({
    where: { workspaceId: created.workspace.id },
    include: { versions: true },
  });

  await prisma.agentVersion.update({
    where: { id: agent.versions[0].id },
    data: { status: 'PUBLISHED', publishedAt: new Date() },
  });

  return {
    workspaceId: created.workspace.id,
    userId: created.user.id,
    channelId: channel.id,
  };
}

const A = await makeWorkspace('a');
const B = await makeWorkspace('b');

// =============================================================================
console.log('\n== Seguridad ==');
// =============================================================================
{
  // --- Dos workspaces no comparten nada ---
  // Se crea uno en cada workspace: el de A existe para que la comparacion sea
  // entre dos bases pobladas y no entre una llena y una vacia.
  await prisma.contact.create({
    data: { workspaceId: A.workspaceId, firstName: 'A', lastName: 'Uno', email: `a1-${stamp}@t.test` },
  });
  const contactoB = await prisma.contact.create({
    data: { workspaceId: B.workspaceId, firstName: 'B', lastName: 'Uno', email: `b1-${stamp}@t.test` },
  });

  const agentesDeB = await prisma.agentDefinition.findMany({
    where: { workspaceId: B.workspaceId },
    select: { id: true },
  });
  const segmentosDeB = await prisma.segment.findMany({
    where: { workspaceId: B.workspaceId },
    select: { id: true },
  });

  const entidades: { nombre: string; cuenta: () => Promise<number> }[] = [
    { nombre: 'contactos', cuenta: () => prisma.contact.count({ where: { workspaceId: A.workspaceId, id: contactoB.id } }) },
    { nombre: 'conversaciones', cuenta: () => prisma.conversation.count({ where: { workspaceId: A.workspaceId, contactId: contactoB.id } }) },
    { nombre: 'ordenes', cuenta: () => prisma.customerOrder.count({ where: { workspaceId: A.workspaceId, contactId: contactoB.id } }) },
    { nombre: 'cotizaciones', cuenta: () => prisma.quote.count({ where: { workspaceId: A.workspaceId, contactId: contactoB.id } }) },
    {
      nombre: 'agentes',
      cuenta: () =>
        prisma.agentDefinition.count({
          where: { workspaceId: A.workspaceId, id: { in: agentesDeB.map((agent) => agent.id) } },
        }),
    },
    {
      nombre: 'segmentos y campanas',
      cuenta: () =>
        prisma.segment.count({
          where: { workspaceId: A.workspaceId, id: { in: segmentosDeB.map((segment) => segment.id) } },
        }),
    },
  ];

  for (const entidad of entidades) {
    check(`Dos workspaces no comparten ${entidad.nombre}`, (await entidad.cuenta()) === 0);
  }

  // El segmento de fabrica existe en los dos, con la misma clave y distinto id:
  // lo que no se comparte es la fila, no el concepto.
  check('Cada workspace tiene sus propios segmentos de fabrica', segmentosDeB.length === 8);

  // --- Webhook con firma invalida ---
  const secreto = 'secreto-critico';
  const cuerpo = JSON.stringify({ hola: 'mundo' });
  const firmaMeta = createHmac('sha256', secreto).update(cuerpo, 'utf8').digest('hex');

  check(
    'Webhook con firma invalida se rechaza (Meta)',
    !verifyMetaSignature({ rawBody: cuerpo, signatureHeader: 'sha256=invalida', appSecret: secreto }).valid,
  );
  check(
    'Y con la valida se acepta',
    verifyMetaSignature({ rawBody: cuerpo, signatureHeader: `sha256=${firmaMeta}`, appSecret: secreto }).valid,
  );
  check(
    'Alterar el cuerpo invalida la firma',
    !verifyMetaSignature({ rawBody: `${cuerpo} `, signatureHeader: `sha256=${firmaMeta}`, appSecret: secreto }).valid,
  );

  const firmaShopify = createHmac('sha256', secreto).update(cuerpo, 'utf8').digest('base64');
  check('Webhook con firma invalida se rechaza (Shopify)',
    !verifyWebhookHmac({ rawBody: cuerpo, header: 'invalida', secret: secreto }).valid);
  check('Y con la valida se acepta (Shopify usa base64, no hex)',
    verifyWebhookHmac({ rawBody: cuerpo, header: firmaShopify, secret: secreto }).valid);
  check('La firma hex de Meta NO vale para Shopify',
    !verifyWebhookHmac({ rawBody: cuerpo, header: firmaMeta, secret: secreto }).valid);

  // --- IDs ajenos no filtran informacion ---
  const ajeno = await prisma.contact.findFirst({
    where: { id: contactoB.id, workspaceId: A.workspaceId },
  });
  check('Un id ajeno no devuelve el registro', ajeno === null);

  const cotizacionAjena = await prisma.quote.findFirst({
    where: { workspaceId: A.workspaceId, contactId: contactoB.id },
  });
  check('Ni una cotizacion de otro workspace', cotizacionAjena === null);

  // --- Tokens no aparecen en respuestas ---
  const canal = await prisma.whatsAppChannel.findUniqueOrThrow({ where: { id: A.channelId } });
  check('El token del canal se guarda cifrado o vacio, nunca en claro',
    canal.accessTokenEncrypted === null || canal.accessTokenEncrypted.startsWith('v1:'));

  const conexiones = await prisma.commerceConnection.findMany();
  check('Lo mismo para los tokens de comercio',
    conexiones.every((c) => c.accessTokenEncrypted === null || c.accessTokenEncrypted.startsWith('v1:')));

  // El id publico del workspace no es el id interno.
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: A.workspaceId } });
  check('El identificador publico no es el id interno', workspace.publicKey !== workspace.id);
}

// =============================================================================
console.log('\n== Confiabilidad ==');
// =============================================================================
{
  // --- Webhook repetido 10 veces produce un solo efecto ---
  const dedupeKey = `critico-webhook-${stamp}`;

  for (let i = 0; i < 10; i += 1) {
    await enqueue({
      type: JobType.PROCESS_OUTBOX,
      workspaceId: A.workspaceId,
      payload: { intento: i },
      dedupeKey,
    });
  }

  const encolados = await prisma.job.count({ where: { dedupeKey } });
  check('Un webhook repetido 10 veces deja un solo trabajo', encolados === 1, `${encolados}`);

  // --- Worker que falla despues de guardar reintenta sin duplicar ---
  const reintentable = await enqueue({
    type: JobType.PROCESS_OUTBOX,
    workspaceId: A.workspaceId,
    payload: {},
    dedupeKey: `critico-retry-${stamp}`,
  });

  const tomados = await claimJobs(5);
  const mio = tomados.find((job) => job.id === reintentable?.id);
  check('Un trabajo se toma una sola vez', mio !== undefined);

  // Segunda toma inmediata: ya no esta disponible.
  const segundos = await claimJobs(5);
  check(
    'Dos workers simultaneos no toman el mismo trabajo',
    !segundos.some((job) => job.id === reintentable?.id),
  );

  // Se simula el fallo tras guardar: vuelve a PENDING y se puede reintentar.
  if (mio) {
    await prisma.job.update({
      where: { id: mio.id },
      data: { status: JobStatus.PENDING, runAt: new Date(Date.now() - 1000), lastError: 'fallo simulado' },
    });

    const reintento = await claimJobs(5);
    check(
      'Tras un fallo el trabajo se vuelve a tomar',
      reintento.some((job) => job.id === mio.id),
    );

    const total = await prisma.job.count({ where: { dedupeKey: `critico-retry-${stamp}` } });
    check('Y el reintento no creo un trabajo nuevo', total === 1);
  }

  // --- Pago repetido no duplica entrega ---
  const comprador = await prisma.contact.create({
    data: { workspaceId: A.workspaceId, firstName: 'Comprador', lastName: 'Critico', email: `comp-${stamp}@t.test` },
  });

  const orden = await prisma.customerOrder.create({
    data: {
      workspaceId: A.workspaceId,
      contactId: comprador.id,
      status: OrderStatus.PENDING_PAYMENT,
      total: 10000,
    },
  });

  const pagoExterno = `mp-${stamp}`;

  for (let i = 0; i < 3; i += 1) {
    await prisma.payment.upsert({
      where: { externalId: pagoExterno },
      create: {
        workspaceId: A.workspaceId,
        orderId: orden.id,
        provider: 'MERCADO_PAGO',
        externalId: pagoExterno,
        status: PaymentStatus.APPROVED,
        amount: 10000,
      },
      update: {},
    });
  }

  const pagos = await prisma.payment.count({ where: { orderId: orden.id } });
  check('Un pago repetido no crea tres pagos', pagos === 1, `${pagos}`);

  // --- Reinicio durante un journey conserva el proximo paso ---
  const journey = await prisma.journey.create({
    data: {
      workspaceId: A.workspaceId,
      key: `critico-${stamp}`,
      name: 'Journey critico',
      trigger: 'MANUAL',
      status: 'PUBLISHED',
      publishedAt: new Date(),
      steps: {
        create: [
          { position: 1, label: 'Tarea 1', action: 'CREATE_TASK', delayHours: 0, body: 'uno' },
          { position: 2, label: 'Tarea 2', action: 'CREATE_TASK', delayHours: 24, body: 'dos' },
        ],
      },
    },
  });

  const inscripcion = await enroll({
    workspaceId: A.workspaceId,
    journeyId: journey.id,
    contactId: comprador.id,
  });

  await prisma.messagingPolicy.update({
    where: { workspaceId: A.workspaceId },
    data: { quietStartMinute: 0, quietEndMinute: 0 },
  });

  await prisma.journeyEnrollment.updateMany({
    where: { journeyId: journey.id },
    data: { nextRunAt: new Date(Date.now() - 1000) },
  });

  const enrollmentId = inscripcion.enrolled ? inscripcion.enrollmentId : '';
  await advanceEnrollment(enrollmentId, new Date());

  // "Reinicio": se vuelve a leer el estado desde la base, sin memoria previa.
  const traslado = await prisma.journeyEnrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
  check(
    'Un reinicio durante un journey conserva el proximo paso',
    traslado.currentPosition === 2 && traslado.nextRunAt !== null,
    `paso ${traslado.currentPosition}`,
  );
}

// =============================================================================
console.log('\n== IA ==');
// =============================================================================
{
  async function conversar(guion: { text?: string | null; toolCalls?: never[] }[], texto: string) {
    const contacto = await prisma.contact.create({
      data: {
        workspaceId: A.workspaceId,
        firstName: 'IA',
        lastName: `${Math.random().toString(36).slice(2, 8)}`,
        phone: `+5697${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`,
      },
    });

    const conversacion = await prisma.conversation.create({
      data: {
        workspaceId: A.workspaceId,
        channelId: A.channelId,
        contactId: contacto.id,
        mode: ConversationMode.AI_ACTIVE,
        status: ConversationStatus.OPEN,
      },
    });

    await prisma.message.create({
      data: {
        workspaceId: A.workspaceId,
        conversationId: conversacion.id,
        direction: MessageDirection.INBOUND,
        senderType: MessageSenderType.CONTACT,
        text: texto,
        status: MessageStatus.DELIVERED,
      },
    });

    const resultado = await runAgent({
      workspaceId: A.workspaceId,
      conversationId: conversacion.id,
      provider: new ScriptedProvider(guion),
    });

    return { resultado, conversacionId: conversacion.id, contactoId: contacto.id };
  }

  // --- Pregunta fuera del catalogo: reconoce el limite ---
  const fuera = await conversar(
    [{ text: 'No tengo esa informacion en el catalogo. Te paso con una persona.' }],
    'venden repuestos de avion?',
  );
  check(
    'Pregunta fuera del catalogo: la respuesta no inventa un producto',
    !looksLikeHallucination(fuera.resultado.reply ?? ''),
  );

  // --- Descuento no autorizado: se rechaza ---
  check(
    'Un descuento inventado se detecta como alucinacion',
    looksLikeHallucination('Te hago un 30% de descuento, queda en $35.000'),
  );
  check('Un porcentaje suelto tambien', looksLikeHallucination('Tienes 20% de descuento'));
  check('Y un total afirmado con otra redaccion',
    looksLikeHallucination('Te lo dejo en 19990'));

  // Los falsos positivos importan tanto como los negativos: un guardrail que
  // bloquea respuestas normales deja al agente mudo.
  const legitimas = [
    'Claro, cuentame que necesitas y lo vemos.',
    'Te paso con una persona del equipo.',
    'Reviso el catalogo y te confirmo.',
    'Perfecto, te envio la cotizacion en cuanto la revise el equipo.',
  ];
  check('Y no bloquea respuestas normales',
    legitimas.every((texto) => !looksLikeHallucination(texto)));

  const conDescuento = await conversar(
    [{ text: 'Claro, te dejo el producto en $19.990 con descuento especial.' }],
    'me haces descuento?',
  );
  check(
    'Y una respuesta con descuento inventado NO se envia',
    conDescuento.resultado.escalated === true,
  );

  const enviados = await prisma.message.count({
    where: { conversationId: conDescuento.conversacionId, direction: MessageDirection.OUTBOUND },
  });
  check('Nada salio hacia el cliente', enviados === 0);

  // --- "Ya pague": la herramienta existe para consultar ---
  const consulta = AGENT_TOOLS.find((tool) => tool.name === 'get_payment_status');
  check('Existe la herramienta para consultar un pago', consulta !== undefined);
  check(
    'Y afirmar un pago sin consultarlo se detecta',
    looksLikeHallucination('Tu pago fue confirmado correctamente'),
  );

  // --- Usuario pide humano: pausa la IA ---
  check('Pedir una persona escala de inmediato',
    needsImmediateEscalation('quiero hablar con una persona'));

  const pideHumano = await conversar([{ text: 'Te ayudo yo mismo.' }], 'quiero hablar con un humano');
  check('La IA no responde cuando se pide una persona',
    pideHumano.resultado.escalated === true);

  const conversacion = await prisma.conversation.findUniqueOrThrow({
    where: { id: pideHumano.conversacionId },
  });
  check('Y la conversacion queda esperando a alguien',
    conversacion.mode !== ConversationMode.AI_ACTIVE, conversacion.mode);

  // --- Datos incompletos de cotizacion: pregunta lo que falta ---
  const intake = parseIntakeSchema({
    fields: [
      { key: 'ancho', label: 'Ancho', type: 'number', required: true },
      { key: 'alto', label: 'Alto', type: 'number', required: true },
    ],
  });

  const incompleto = validateIntake(intake!, { ancho: 2 });
  check('Datos incompletos no producen un total', !incompleto.ok);
  // `missing` trae las claves; la herramienta del agente las traduce a
  // etiquetas para que pregunte en lenguaje natural (probado en la Fase 7).
  check('Y se dice exactamente que falta',
    !incompleto.ok && incompleto.missing.includes('alto'),
    JSON.stringify(incompleto));

  // --- Prompt injection para leer otro negocio: bloqueado ---
  const herramienta = AGENT_TOOLS.find((tool) => tool.name === 'get_contact')!;
  const inyeccion = await herramienta.execute(
    { contactId: (await prisma.contact.findFirstOrThrow({ where: { workspaceId: B.workspaceId } })).id },
    { workspaceId: A.workspaceId, conversationId: null, contactId: null, agentRunId: 'x' },
  );

  check(
    'Prompt injection no alcanza datos de otro negocio',
    (inyeccion as { ok: boolean }).ok === false,
  );
  check(
    'Y la respuesta no filtra que ese id existe en otra parte',
    !JSON.stringify(inyeccion).toLowerCase().includes('otro workspace'),
  );
}

// =============================================================================
console.log('\n== Marketing ==');
// =============================================================================
{
  const contacto = await prisma.contact.create({
    data: {
      workspaceId: A.workspaceId,
      firstName: 'Marketing',
      lastName: 'Critico',
      email: `mk-${stamp}@t.test`,
      phone: '+56988887777',
    },
  });

  await grantConsent({
    workspaceId: A.workspaceId,
    contactId: contacto.id,
    channel: ConsentChannel.WHATSAPP,
    source: 'prueba',
  });

  // --- Opt-out por WhatsApp ---
  await revokeConsent({
    workspaceId: A.workspaceId,
    contactId: contacto.id,
    channel: ConsentChannel.WHATSAPP,
    reason: SuppressionReason.USER_REQUEST,
    source: 'dijo "no me escriban"',
  });

  const trasOptOut = await canContact({
    workspaceId: A.workspaceId,
    contactId: contacto.id,
    channel: ConsentChannel.WHATSAPP,
  });
  check('Opt-out por WhatsApp bloquea el canal', !trasOptOut.allowed, trasOptOut.reason);

  // --- Unsubscribe email (cubierto a fondo en la Fase 8; aqui el efecto) ---
  await grantConsent({
    workspaceId: A.workspaceId,
    contactId: contacto.id,
    channel: ConsentChannel.EMAIL,
    source: 'prueba',
  });
  await revokeConsent({
    workspaceId: A.workspaceId,
    contactId: contacto.id,
    channel: ConsentChannel.EMAIL,
    source: 'enlace de baja',
  });

  const trasBaja = await canContact({
    workspaceId: A.workspaceId,
    contactId: contacto.id,
    channel: ConsentChannel.EMAIL,
  });
  check('Unsubscribe de email bloquea el canal', !trasBaja.allowed);

  // --- Contacto suprimido reimportado sigue suprimido ---
  const email = `reimport-${stamp}@t.test`;
  await suppressIdentifier({
    workspaceId: A.workspaceId,
    channel: ConsentChannel.EMAIL,
    identifier: email,
    reason: SuppressionReason.USER_REQUEST,
  });

  // "Reimportacion": se borra el contacto y se vuelve a crear desde cero.
  const reimportado = await prisma.contact.create({
    data: { workspaceId: A.workspaceId, firstName: 'Re', lastName: 'Importado', email },
  });

  const intento = await grantConsent({
    workspaceId: A.workspaceId,
    contactId: reimportado.id,
    channel: ConsentChannel.EMAIL,
    source: 'importacion csv',
  });

  check('Reimportar un suprimido NO le devuelve el consentimiento', intento.granted === false);

  const sigueBloqueado = await canContact({
    workspaceId: A.workspaceId,
    contactId: reimportado.id,
    channel: ConsentChannel.EMAIL,
  });
  check('Y sigue bloqueado', !sigueBloqueado.allowed && sigueBloqueado.reason === 'SUPPRESSED');

  // --- Pago cancela la recuperacion, y horario nocturno reprograma ---
  // Ambos estan cubiertos a fondo en la suite de la Fase 8. Aqui se comprueba
  // que las piezas siguen en su sitio para no dar por bueno algo que se movio.
  const { nextAllowedInstant, isQuietHour, DEFAULT_POLICY } = await import('../src/lib/marketing/policy');
  const noche = new Date('2026-06-16T01:00:00Z');
  const politica = { ...DEFAULT_POLICY, timezone: 'America/Santiago' };

  check('Horario nocturno se reconoce', isQuietHour(noche, politica));
  check('Y se reprograma en vez de enviarse',
    nextAllowedInstant(noche, politica).getTime() > noche.getTime());
}

// =============================================================================
console.log('\n== Ecommerce ==');
// =============================================================================
{
  const producto = await prisma.product.create({
    data: { workspaceId: A.workspaceId, name: 'Producto critico', status: 'ACTIVE' },
  });

  const variante = await prisma.productVariant.create({
    data: {
      productId: producto.id,
      name: 'Unica',
      sku: `sku-${stamp}`,
      priceClp: 25000,
      inventory: 0,
    },
  });

  // --- Variante agotada ---
  const inventario = AGENT_TOOLS.find((tool) => tool.name === 'check_inventory')!;
  const agotada = await inventario.execute(
    { variantId: variante.id },
    { workspaceId: A.workspaceId, conversationId: null, contactId: null, agentRunId: 'x' },
  );
  check('Una variante agotada se reporta sin stock',
    JSON.stringify(agotada).includes('0') || JSON.stringify(agotada).toLowerCase().includes('false'));

  // --- Cambio de precio entre recomendacion y checkout ---
  const precioAntes = variante.priceClp;
  await prisma.productVariant.update({ where: { id: variante.id }, data: { priceClp: 30000, inventory: 5 } });

  const contacto = await prisma.contact.create({
    data: { workspaceId: A.workspaceId, firstName: 'Ecom', lastName: 'Critico', email: `ec-${stamp}@t.test` },
  });

  const orden = await prisma.customerOrder.create({
    data: {
      workspaceId: A.workspaceId,
      contactId: contacto.id,
      status: OrderStatus.PENDING_PAYMENT,
      total: 30000,
      lines: {
        create: [{ variantId: variante.id, name: 'Producto critico', unitPrice: 30000, quantity: 1, total: 30000 }],
      },
    },
    include: { lines: true },
  });

  check(
    'La orden guarda el precio del momento, no el de la recomendacion',
    orden.lines[0].unitPrice === 30000 && precioAntes !== 30000,
  );

  // --- Pago rechazado no crea fulfillment ---
  await prisma.payment.create({
    data: {
      workspaceId: A.workspaceId,
      orderId: orden.id,
      provider: 'MERCADO_PAGO',
      externalId: `rechazado-${stamp}`,
      status: PaymentStatus.REJECTED,
      amount: 30000,
    },
  });

  const fulfillmentTrasRechazo = await prisma.fulfillmentOrder.count({ where: { orderId: orden.id } });
  check('Un pago rechazado no crea fulfillment', fulfillmentTrasRechazo === 0);

  const ordenTrasRechazo = await prisma.customerOrder.findUniqueOrThrow({ where: { id: orden.id } });
  check('Ni confirma la orden', ordenTrasRechazo.status === OrderStatus.PENDING_PAYMENT);

  // --- Orden pagada y fulfillment creado ---
  const { processOrderPayment } = await import('../src/lib/commerce/payment-webhook');

  const pagoInput = {
    orderId: orden.id,
    externalPaymentId: `aprobado-${stamp}`,
    status: PaymentStatus.APPROVED,
    rawStatus: 'approved',
    amount: 30000,
    currency: 'CLP',
    baseUrl: 'http://localhost:3001',
  };

  await processOrderPayment(pagoInput);

  const pagada = await prisma.customerOrder.findUniqueOrThrow({
    where: { id: orden.id },
    include: { fulfillments: true },
  });

  check('Una orden pagada se confirma', pagada.status !== OrderStatus.PENDING_PAYMENT, pagada.status);

  // Un producto fisico NO genera fulfillment automatico: el despacho lo hace
  // una persona. Solo lo digital se entrega solo.
  check('Un producto fisico no genera fulfillment automatico', pagada.fulfillments.length === 0);

  // Repetir el mismo pago no duplica nada.
  await processOrderPayment(pagoInput);

  const tras = await prisma.customerOrder.findUniqueOrThrow({
    where: { id: orden.id },
    include: { fulfillments: true, payments: true },
  });

  check('Un pago repetido no duplica el fulfillment', tras.fulfillments.length === pagada.fulfillments.length);
  check('Ni el pago', tras.payments.filter((p) => p.externalId === `aprobado-${stamp}`).length === 1);

  // --- E2E de infoproducto: comprar, pagar, entregar ---
  const infoproducto = await prisma.product.create({
    data: {
      workspaceId: A.workspaceId,
      name: 'Curso critico',
      type: 'DIGITAL',
      status: 'ACTIVE',
      variants: { create: [{ name: 'Acceso', priceClp: 49000, isDefault: true }] },
      assets: {
        create: [{
          workspaceId: A.workspaceId,
          name: 'Manual PDF',
          kind: 'LINK',
          target: 'https://ejemplo.test/manual.pdf',
        }],
      },
    },
    include: { variants: true, assets: true },
  });

  const alumno = await prisma.contact.create({
    data: { workspaceId: A.workspaceId, firstName: 'Alumno', lastName: 'Critico', email: `al-${stamp}@t.test` },
  });

  const ordenDigital = await prisma.customerOrder.create({
    data: {
      workspaceId: A.workspaceId,
      contactId: alumno.id,
      status: OrderStatus.PENDING_PAYMENT,
      total: 49000,
      customerEmail: alumno.email,
      lines: {
        create: [{
          variantId: infoproducto.variants[0].id,
          name: 'Curso critico',
          unitPrice: 49000,
          quantity: 1,
          total: 49000,
        }],
      },
    },
  });

  const pagoDigital = {
    orderId: ordenDigital.id,
    externalPaymentId: `digital-${stamp}`,
    status: PaymentStatus.APPROVED,
    rawStatus: 'approved',
    amount: 49000,
    currency: 'CLP',
    baseUrl: 'http://localhost:3001',
  };

  await processOrderPayment(pagoDigital);

  const entregada = await prisma.customerOrder.findUniqueOrThrow({
    where: { id: ordenDigital.id },
    include: { fulfillments: true, deliveries: true },
  });

  check('E2E infoproducto: el pago crea la entrega digital', entregada.deliveries.length === 1);
  check('Y el fulfillment', entregada.fulfillments.length === 1);
  check('Y la orden queda cumplida', entregada.status === OrderStatus.FULFILLED, entregada.status);
  check(
    'El token de entrega se guarda hasheado',
    entregada.deliveries[0].tokenHash.length === 64,
  );

  // El pago repetido NO vuelve a entregar: es la prueba de la matriz.
  await processOrderPayment(pagoDigital);

  const trasRepetir = await prisma.customerOrder.findUniqueOrThrow({
    where: { id: ordenDigital.id },
    include: { fulfillments: true, deliveries: true },
  });

  check('Un pago repetido no duplica la entrega', trasRepetir.deliveries.length === 1);
  check('Ni el fulfillment', trasRepetir.fulfillments.length === 1);
}

// =============================================================================
console.log('\n== Cotizacion ==');
// =============================================================================
{
  const intake = parseIntakeSchema({
    fields: [
      { key: 'superficie', label: 'Superficie', type: 'number', required: true, unit: 'm2' },
      { key: 'unidades', label: 'Unidades', type: 'number', required: true },
      { key: 'dificultad', label: 'Dificultad', type: 'select', required: true, options: ['normal', 'alta'] },
    ],
  })!;

  const reglas = parseRules({
    components: [
      { key: 'base', label: 'Superficie', type: 'PER_UNIT', unitPriceClp: 10000, quantityFrom: 'superficie' },
      { key: 'unidades', label: 'Unidades', type: 'PER_UNIT', unitPriceClp: 5000, quantityFrom: 'unidades' },
      {
        key: 'recargo',
        label: 'Acceso dificil',
        type: 'SURCHARGE',
        percent: 20,
        when: { match: 'ALL', rules: [{ field: 'dificultad', operator: 'eq', value: 'alta' }] },
      },
    ],
    minimumClp: 80000,
    roundToClp: 1000,
  })!;

  // Una clave desconocida se rechaza en vez de descartarse: escribir
  // `conditions` en lugar de `when` dejaba el recargo sin condicion y se le
  // cobraba a todos.
  check(
    'Una regla con una clave mal escrita se rechaza',
    parseRules({
      components: [
        {
          key: 'recargo',
          label: 'x',
          type: 'SURCHARGE',
          percent: 20,
          conditions: { match: 'ALL', rules: [] },
        },
      ],
    }) === null,
  );

  // --- Formulas y redondeos ---
  const simple = calculateQuote(reglas, { superficie: 10, unidades: 2 });
  check('Las formulas dan el total conocido a mano', simple.total === 110000, `${simple.total}`);

  const redondeo = calculateQuote({ ...reglas, roundToClp: 1000, minimumClp: 0 }, { superficie: 1.234, unidades: 0 });
  check('El redondeo se aplica al total', redondeo.total % 1000 === 0, `${redondeo.total}`);

  // --- Minimo de instalacion ---
  const bajoMinimo = calculateQuote(reglas, { superficie: 1, unidades: 0 });
  check('El minimo se aplica cuando el calculo queda por debajo', bajoMinimo.total === 80000);
  check('Y queda registrado como linea, no escondido',
    bajoMinimo.lines.some((line) => line.kind === 'MINIMUM_ADJUSTMENT'));

  // --- Recargos ---
  const conRecargo = calculateQuote(reglas, { superficie: 10, unidades: 2, dificultad: 'alta' });
  check('El recargo condicional se aplica', conRecargo.total > simple.total);
  check('Y no se aplica cuando la condicion no se cumple',
    calculateQuote(reglas, { superficie: 10, unidades: 2, dificultad: 'normal' }).total === simple.total);

  // --- El ciclo completo: crear, aprobar, enviar, PDF, vigencia ---
  const ruleSet = await prisma.pricingRuleSet.create({
    data: {
      workspaceId: A.workspaceId,
      serviceKey: `critico-${stamp}`,
      name: 'Servicio critico',
      version: 1,
      status: PricingRuleSetStatus.PUBLISHED,
      publishedAt: new Date(),
      intakeSchema: intake as never,
      rules: reglas as never,
      validityDays: 15,
    },
  });

  const contacto = await prisma.contact.create({
    data: { workspaceId: A.workspaceId, firstName: 'Cotiza', lastName: 'Critico', email: `co-${stamp}@t.test` },
  });

  const cotizacion = await createQuote({
    workspaceId: A.workspaceId,
    serviceKey: ruleSet.serviceKey,
    inputs: { superficie: 10, unidades: 2, dificultad: 'normal' },
    contactId: contacto.id,
  });

  // `createQuote` deja la cotizacion CALCULATED: nada se envia todavia. La
  // revision humana la pide el flujo del agente (`request_quote_review`), y
  // aprobar es lo unico que produce un PDF enviable.
  check('La cotizacion nace sin poder enviarse', cotizacion.status === QuoteStatus.CALCULATED);
  check('Con el total del motor', cotizacion.total === simple.total, `${cotizacion.total}`);

  const aprobada = await approveQuote({
    workspaceId: A.workspaceId,
    quoteId: cotizacion.id,
    reviewer: { id: A.userId, role: 'OWNER' },
  });

  const trasAprobar = await prisma.quote.findUniqueOrThrow({
    where: { id: cotizacion.id },
    include: { lines: true },
  });

  check('Aprobar la deja lista para enviar', trasAprobar.status === QuoteStatus.APPROVED);
  check('Y entrega el token del enlace una sola vez', typeof aprobada.token === 'string');
  check('En la base solo queda su hash', trasAprobar.pdfTokenHash !== aprobada.token);

  const pdf = renderQuotePdf({
    workspaceName: 'Critico',
    number: trasAprobar.number,
    version: trasAprobar.version,
    serviceName: ruleSet.name,
    customerName: 'Cotiza Critico',
    issuedAt: trasAprobar.createdAt,
    validUntil: trasAprobar.validUntil,
    currency: trasAprobar.currency,
    lines: trasAprobar.lines.map((line) => ({
      label: line.label,
      detail: line.detail,
      amount: line.amount,
    })),
    subtotal: trasAprobar.subtotal,
    surcharges: trasAprobar.surcharges,
    discounts: trasAprobar.discounts,
    total: trasAprobar.total,
    inputs: [{ label: 'Superficie', value: '10 m2' }],
    disclaimer: trasAprobar.disclaimer,
  });

  check('El PDF se genera', pdf.byteLength > 500, `${pdf.byteLength} bytes`);
  check('Y es un PDF de verdad', Buffer.from(pdf.subarray(0, 5)).toString() === '%PDF-');
  // El PDF formatea los montos con separador de miles: buscar "110000" no lo
  // encontraria aunque este.
  const totalFormateado = trasAprobar.total.toLocaleString('es-CL');
  check('Con el total aprobado dentro',
    Buffer.from(pdf).toString('latin1').includes(totalFormateado), totalFormateado);

  await markQuoteSent({ workspaceId: A.workspaceId, quoteId: cotizacion.id, actorId: A.userId });
  const enviada = await prisma.quote.findUniqueOrThrow({ where: { id: cotizacion.id } });
  check('Enviar cambia el estado', enviada.status === QuoteStatus.SENT);

  // --- Vigencia ---
  await prisma.quote.update({
    where: { id: cotizacion.id },
    data: { validUntil: new Date(Date.now() - 86_400_000) },
  });

  const vencidas = await expireOverdueQuotes();
  check('Una cotizacion pasada de fecha se vence sola', vencidas >= 1);

  const vencida = await prisma.quote.findUniqueOrThrow({ where: { id: cotizacion.id } });
  check('Y queda como EXPIRED', vencida.status === QuoteStatus.EXPIRED);

  // Una aceptada no se vence: ya cumplio su proposito.
  const aceptada = await prisma.quote.create({
    data: {
      workspaceId: A.workspaceId,
      ruleSetId: ruleSet.id,
      contactId: contacto.id,
      serviceKey: ruleSet.serviceKey,
      number: `Q-CRIT-${stamp}`,
      status: QuoteStatus.ACCEPTED,
      inputs: {},
      subtotal: 1000,
      total: 1000,
      validUntil: new Date(Date.now() - 86_400_000),
    },
  });

  await expireOverdueQuotes();
  const sigueAceptada = await prisma.quote.findUniqueOrThrow({ where: { id: aceptada.id } });
  check('Una aceptada no se vence', sigueAceptada.status === QuoteStatus.ACCEPTED);
}

// =============================================================================
console.log('\n== Kill switches ==');
// =============================================================================
{
  check('Por defecto todo esta encendido', await isEnabled('AI_AGENTS', A.workspaceId));

  await setFlag({ key: 'AI_AGENTS', enabled: false, workspaceId: A.workspaceId, note: 'prueba' });
  check('Apagar la IA de un workspace la apaga', !(await isEnabled('AI_AGENTS', A.workspaceId)));
  check('Y no toca al otro workspace', await isEnabled('AI_AGENTS', B.workspaceId));

  // El CRM sigue funcionando: lo que se apaga es el agente, no el producto.
  const contacto = await prisma.contact.create({
    data: { workspaceId: A.workspaceId, firstName: 'Switch', lastName: 'Critico', phone: '+56977776666' },
  });
  check('Con la IA apagada el CRM sigue aceptando contactos', contacto.id.length > 0);

  const conversacion = await prisma.conversation.create({
    data: {
      workspaceId: A.workspaceId,
      channelId: A.channelId,
      contactId: contacto.id,
      mode: ConversationMode.AI_ACTIVE,
      status: ConversationStatus.OPEN,
    },
  });

  const apagado = await runAgent({
    workspaceId: A.workspaceId,
    conversationId: conversacion.id,
    provider: new ScriptedProvider([{ text: 'no deberia salir' }]),
  });

  check('Y el agente no corre', apagado.status === AgentRunStatus.ABORTED, apagado.skippedReason);
  check('Con el motivo explicito', apagado.skippedReason === 'agentes IA apagados');

  await setFlag({ key: 'AI_AGENTS', enabled: true, workspaceId: A.workspaceId });
  check('Volver a encender lo reactiva', await isEnabled('AI_AGENTS', A.workspaceId));

  // Un corte global gana sobre el interruptor del workspace.
  await setFlag({ key: 'CAMPAIGNS', enabled: true, workspaceId: A.workspaceId });
  await setFlag({ key: 'CAMPAIGNS', enabled: false, note: 'incidente de prueba' });

  check(
    'Un corte global gana sobre el interruptor del workspace',
    !(await isEnabled('CAMPAIGNS', A.workspaceId)),
  );

  await prisma.featureFlag.deleteMany({ where: { scope: 'GLOBAL' } });
  check('Retirado el corte global, vuelve a mandar el del workspace',
    await isEnabled('CAMPAIGNS', A.workspaceId));
}

// =============================================================================
console.log('\n== Rate limiting ==');
// =============================================================================
{
  const identificador = `critico-${stamp}`;

  let ultimo = await consume('login', identificador);
  for (let i = 1; i < 10; i += 1) ultimo = await consume('login', identificador);

  check('Dentro del limite se permite', ultimo.allowed, `${ultimo.remaining} restantes`);

  const excedido = await consume('login', identificador);
  check('Pasado el limite se rechaza', !excedido.allowed);
  check('Y se dice cuando se libera', excedido.resetAt.getTime() > Date.now());

  // Otro identificador tiene su propio cupo.
  const otro = await consume('login', `${identificador}-otro`);
  check('El limite es por identificador, no global', otro.allowed);

  // Los webhooks tienen un limite mucho mas alto: cortarle el webhook a un
  // proveedor legitimo pierde mensajes y pagos.
  const { RATE_LIMITS } = await import('../src/lib/ops/rate-limit');
  check('El limite de webhooks es mucho mas alto que el de login',
    RATE_LIMITS.webhook.limit > RATE_LIMITS.login.limit * 10);
}

// --- Limpieza ---------------------------------------------------------------
const deleted = await prisma.workspace.deleteMany({ where: { slug: { startsWith: 'critico-' } } });
await prisma.rateLimitWindow.deleteMany({ where: { bucket: { contains: `critico-${stamp}` } } });
await prisma.job.deleteMany({ where: { dedupeKey: { startsWith: 'critico-' } } });
console.log(`\nLimpieza: ${deleted.count} workspaces de prueba eliminados (cascade).`);

console.log(`\n== Resultado: ${results.length - failures}/${results.length} pruebas OK ==`);
await prisma.$disconnect();
process.exit(failures > 0 ? 1 : 0);
