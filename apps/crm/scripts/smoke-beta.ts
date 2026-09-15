import './fixtures/test-environment';
import assert from 'node:assert/strict';
import https from 'node:https';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { encryptSecret } from '../src/lib/crypto';
import { activateHumanControl } from '../src/lib/whatsapp/human-control';
import { queueOutboundMessage, processOutbox } from '../src/lib/whatsapp/outbound';
import { ingestWebhookEvent, processWebhookEvent } from '../src/lib/whatsapp/inbound';
import { downloadWhatsAppMedia } from '../src/lib/whatsapp/media';
import { inboundTextPayload } from './fixtures/whatsapp';
import { asUser } from './fixtures/request-context';
import * as mediaRoute from '../src/app/api/media/[id]/route';
import * as pushRoute from '../src/app/api/push/subscriptions/route';
import * as rulesRoute from '../src/app/api/pricing-rule-sets/route';
import * as publishRoute from '../src/app/api/pricing-rule-sets/[id]/publish/route';
import * as archiveRoute from '../src/app/api/pricing-rule-sets/[id]/archive/route';
import { createQuote, approveQuote, rejectQuote } from '../src/lib/quotes/service';
import { queuePushEvent } from '../src/lib/push/events';
import { sendPushJob } from '../src/lib/push/send';
import { getOnboardingState } from '../src/lib/onboarding/steps';
import { resolveStorage } from '../src/lib/storage';

const stamp = randomUUID();
const workspaceIds: string[] = [];
const eventIds: string[] = [];
const planIds: string[] = [];
const guardedFetch = globalThis.fetch;
let passed = 0;
let failed = 0;
async function test(name: string, run: () => Promise<void>) {
  try {
    await run();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (error) {
    failed++;
    console.error(`FALLA  ${name}`, error);
  } finally {
    globalThis.fetch = guardedFetch;
  }
}
const request = (body: unknown) =>
  new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
async function workspace(key: string) {
  const result = await createCustomerWorkspace({
    companyName: `beta-${key}-${stamp}`,
    ownerName: key,
    email: `beta-${key}-${stamp}@example.test`,
    password: 'Beta#Test1234',
  });
  workspaceIds.push(result.workspace.id);
  const channel = await prisma.whatsAppChannel.create({
    data: {
      workspaceId: result.workspace.id,
      wabaId: `waba-${key}-${stamp}`,
      phoneNumberId: `pn-${key}-${stamp}`,
      status: 'CONNECTED',
      displayPhoneNumber: '+56980000000',
      accessTokenEncrypted: encryptSecret('fixture-token'),
      lastHealthCheckAt: new Date(),
      webhookSubscribedAt: new Date(),
    },
  });
  return { ...result, channel };
}
async function deliver(payload: unknown) {
  const event = await ingestWebhookEvent(JSON.stringify(payload), payload);
  eventIds.push(event.eventId);
  if (!event.duplicate) await processWebhookEvent(event.eventId);
  return event;
}

try {
  const A = await workspace('a');
  const B = await workspace('b');
  let sequence = 0;
  async function conversation() {
    sequence++;
    const externalMessageId = `wamid.beta.${stamp}.${sequence}`;
    await deliver(
      inboundTextPayload({
        phoneNumberId: A.channel.phoneNumberId,
        from: `5698${String(sequence).padStart(6, '0')}`,
        messageId: externalMessageId,
        text: 'Hola',
      }),
    );
    const msg = await prisma.message.findUniqueOrThrow({ where: { externalMessageId } });
    return prisma.conversation.update({
      where: { id: msg.conversationId },
      data: { mode: 'AI_ACTIVE' },
    });
  }
  const queue = (conversationId: string, origin: 'AI' | 'HUMAN' | 'TRANSACTIONAL' = 'AI') =>
    queueOutboundMessage({
      workspaceId: A.workspace.id,
      conversationId,
      origin,
      text: 'Respuesta de prueba',
      senderType: origin === 'AI' ? 'AI' : origin === 'HUMAN' ? 'USER' : 'SYSTEM',
      senderUserId: origin === 'HUMAN' ? A.user.id : undefined,
    });

  await test('Cerco: marcador compartido y bloqueo fetch/https', async () => {
    const rows = await prisma.$queryRaw<
      Array<{ marker: string }>
    >`SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = current_database()`;
    assert.equal(rows[0].marker, 'CRM_UPZITES_ISOLATED_TEST_DATABASE_V1');
    await assert.rejects(fetch('https://graph.facebook.com'), /bloqueada/);
    assert.throws(() => https.request('https://fcm.googleapis.com'), /bloqueada/);
  });

  await test('Takeover cancela PENDING y PROCESSING; humano/transaccional continúan; no revive al reactivar IA', async () => {
    const c = await conversation();
    const pending = await queue(c.id);
    const processing = await queue(c.id);
    await prisma.outboxEvent.update({
      where: { idempotencyKey: `message:${processing.id}` },
      data: { status: 'PROCESSING' },
    });
    const human = await queue(c.id, 'HUMAN');
    const transactional = await queue(c.id, 'TRANSACTIONAL');
    const result = await activateHumanControl({
      workspaceId: A.workspace.id,
      conversationId: c.id,
      assignedUserId: A.user.id,
    });
    assert.equal(result?.cancelledAutomaticMessages, 2);
    for (const id of [pending.id, processing.id]) {
      assert.equal((await prisma.message.findUniqueOrThrow({ where: { id } })).status, 'CANCELLED');
      assert.equal(
        (await prisma.outboxEvent.findUniqueOrThrow({ where: { idempotencyKey: `message:${id}` } }))
          .status,
        'CANCELLED',
      );
    }
    for (const id of [human.id, transactional.id])
      assert.equal((await prisma.message.findUniqueOrThrow({ where: { id } })).status, 'QUEUED');
    await assert.rejects(queue(c.id), { code: 'AI_BLOCKED' });
    await prisma.conversation.update({
      where: { id: c.id },
      data: { mode: 'AI_ACTIVE', lockVersion: { increment: 1 } },
    });
    assert.equal(
      (await prisma.message.findUniqueOrThrow({ where: { id: pending.id } })).status,
      'CANCELLED',
    );
    // Evitar que los mensajes humanos de este caso entren al worker del siguiente.
    await prisma.outboxEvent.updateMany({
      where: {
        workspaceId: A.workspace.id,
        payload: { path: ['conversationId'], equals: c.id },
        status: 'PENDING',
      },
      data: { availableAt: new Date(Date.now() + 86_400_000) },
    });
  });

  await test('Carrera encolar/takeover no deja salida automática pendiente', async () => {
    for (let i = 0; i < 4; i++) {
      const c = await conversation();
      const outcomes = await Promise.allSettled([
        queue(c.id),
        activateHumanControl({ workspaceId: A.workspace.id, conversationId: c.id }),
      ]);
      assert.equal(outcomes[1].status, 'fulfilled');
      if (outcomes[0].status === 'rejected') assert.equal(outcomes[0].reason.code, 'AI_BLOCKED');
      assert.equal(
        await prisma.message.count({
          where: { conversationId: c.id, direction: 'OUTBOUND', status: { not: 'CANCELLED' } },
        }),
        0,
      );
    }
  });

  await test('SENDING ya reservado informa al humano y un fallo de red no revive la IA', async () => {
    const c = await conversation();
    const message = await queue(c.id);
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    globalThis.fetch = async () => {
      entered();
      await gate;
      throw new Error('Red simulada interrumpida');
    };
    const worker = processOutbox(100);
    await Promise.race([
      started,
      worker.then(() => {
        throw new Error('El worker no llego al envio');
      }),
    ]);
    try {
      assert.equal(
        (await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).status,
        'SENDING',
      );
      const takeover = await activateHumanControl({
        workspaceId: A.workspace.id,
        conversationId: c.id,
      });
      assert.equal(takeover?.automaticMessagesAlreadySending, 1);
      assert.equal(takeover.cancelledAutomaticMessages, 0);
    } finally {
      release();
    }
    await worker;
    assert.equal(
      (await prisma.message.findUniqueOrThrow({ where: { id: message.id } })).status,
      'CANCELLED',
    );
  });

  await test('Takeover y cola rechazan conversación de otro workspace', async () => {
    const c = await conversation();
    assert.equal(
      await activateHumanControl({ workspaceId: B.workspace.id, conversationId: c.id }),
      null,
    );
    await assert.rejects(
      queueOutboundMessage({
        workspaceId: B.workspace.id,
        conversationId: c.id,
        text: 'No',
        senderType: 'USER',
        origin: 'HUMAN',
      }),
      { code: 'NOT_FOUND' },
    );
    assert.equal(
      (await prisma.conversation.findUniqueOrThrow({ where: { id: c.id } })).mode,
      'AI_ACTIVE',
    );
  });

  let assetId = '';
  await test('Meta repetido deduplica evento/mensaje/medio; el mismo archivo en otro mensaje sí se guarda', async () => {
    const payload = inboundTextPayload({
      phoneNumberId: A.channel.phoneNumberId,
      from: '5698999999',
      messageId: `wamid.media.${stamp}`,
      text: '',
    });
    const value = payload.entry[0].changes[0].value;
    Object.assign(value.messages[0], {
      type: 'document',
      document: { id: `media-${stamp}`, mime_type: 'application/pdf', filename: 'informe.pdf' },
    });
    await Promise.all(Array.from({ length: 5 }, () => deliver(payload)));
    const message = await prisma.message.findUniqueOrThrow({
      where: { externalMessageId: value.messages[0].id },
      include: { media: true },
    });
    assert.ok(message.media);
    assetId = message.media.id;
    assert.equal(
      await prisma.mediaAsset.count({
        where: { workspaceId: A.workspace.id, externalMediaId: `media-${stamp}` },
      }),
      1,
    );
    assert.equal(
      await prisma.job.count({
        where: {
          workspaceId: A.workspace.id,
          type: 'DOWNLOAD_WHATSAPP_MEDIA',
          payload: { path: ['mediaAssetId'], equals: assetId },
        },
      }),
      1,
    );
    value.messages[0].id = `wamid.media-new.${stamp}`;
    await deliver(payload);
    assert.equal(
      await prisma.mediaAsset.count({
        where: { workspaceId: A.workspace.id, externalMediaId: `media-${stamp}` },
      }),
      2,
    );
  });

  await test('Medios: BLOCKED sin token, descarga concurrente única, STORED idempotente y permisos HTTP', async () => {
    assert.ok(assetId);
    await prisma.whatsAppChannel.update({
      where: { id: A.channel.id },
      data: { accessTokenEncrypted: null },
    });
    assert.equal((await downloadWhatsAppMedia(assetId)).status, 'BLOCKED');
    assert.equal(
      (await asUser(A.user, () => mediaRoute.GET(request({}), params(assetId)))).status,
      409,
    );
    await prisma.whatsAppChannel.update({
      where: { id: A.channel.id },
      data: { accessTokenEncrypted: encryptSecret('fixture-token') },
    });
    let calls = 0;
    globalThis.fetch = async (input) => {
      calls++;
      return String(input).includes('graph.facebook.com')
        ? Response.json({
            url: 'https://lookaside.fbsbx.com/fixture',
            mime_type: 'application/pdf',
            file_size: 14,
          })
        : new Response(Buffer.from('%PDF-1.4\n%%EOF'));
    };
    await Promise.all([downloadWhatsAppMedia(assetId), downloadWhatsAppMedia(assetId)]);
    assert.equal(
      (await prisma.mediaAsset.findUniqueOrThrow({ where: { id: assetId } })).status,
      'STORED',
    );
    assert.equal(calls, 2);
    assert.equal((await downloadWhatsAppMedia(assetId)).skipped, true);
    assert.equal(calls, 2);
    assert.equal(
      (await asUser(null, () => mediaRoute.GET(request({}), params(assetId)))).status,
      401,
    );
    assert.equal(
      (await asUser(B.user, () => mediaRoute.GET(request({}), params(assetId)))).status,
      404,
    );
    const response = await asUser(A.user, () => mediaRoute.GET(request({}), params(assetId)));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Content-Disposition')!, /^attachment;/);
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(await response.text(), '%PDF-1.4\n%%EOF');
    await prisma.mediaAsset.update({ where: { id: assetId }, data: { status: 'EXPIRED' } });
    assert.equal(
      (await asUser(A.user, () => mediaRoute.GET(request({}), params(assetId)))).status,
      409,
    );
  });

  await test('Medios: fallo reintentable, expiración del proveedor y rechazo de contenido peligroso', async () => {
    const asset = await prisma.mediaAsset.findFirstOrThrow({
      where: { workspaceId: A.workspace.id, id: { not: assetId } },
    });
    globalThis.fetch = async () => new Response('', { status: 503 });
    await assert.rejects(downloadWhatsAppMedia(asset.id));
    let stored = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } });
    assert.equal(stored.status, 'FAILED');
    assert.equal(stored.attempts, 1);
    assert.equal(stored.storageKey, null);
    globalThis.fetch = async () => new Response('', { status: 410 });
    assert.equal((await downloadWhatsAppMedia(asset.id)).status, 'EXPIRED');
    assert.equal((await downloadWhatsAppMedia(asset.id)).skipped, true);
    // Otro mensaje pendiente permite comprobar el rechazo sin revivir el expirado.
    const message = await prisma.message.create({
      data: {
        workspaceId: A.workspace.id,
        conversationId: asset.conversationId!,
        direction: 'INBOUND',
        senderType: 'CONTACT',
        type: 'DOCUMENT',
        status: 'DELIVERED',
      },
    });
    const unsafe = await prisma.mediaAsset.create({
      data: {
        workspaceId: A.workspace.id,
        conversationId: asset.conversationId,
        messageId: message.id,
        externalMediaId: `unsafe-${stamp}`,
        kind: 'DOCUMENT',
        declaredMime: 'application/pdf',
      },
    });
    globalThis.fetch = async (input) =>
      String(input).includes('graph.facebook.com')
        ? Response.json({
            url: 'https://lookaside.fbsbx.com/fixture',
            mime_type: 'application/pdf',
          })
        : new Response('<html><script>alert(1)</script></html>');
    assert.equal((await downloadWhatsAppMedia(unsafe.id)).status, 'REJECTED');
    stored = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: unsafe.id } });
    assert.equal(stored.storageKey, null);
    assert.equal(
      (await asUser(A.user, () => mediaRoute.GET(request({}), params(unsafe.id)))).status,
      409,
    );
  });

  const subscription = (endpoint: string) => ({
    endpoint,
    keys: { p256dh: 'x'.repeat(30), auth: 'x'.repeat(12) },
  });
  await test('Push: configuración, persistencia, propietario, preferencias, dedupe y roles de destinatario', async () => {
    const endpoint = `https://push.example.test/${stamp}`;
    assert.equal(
      (await asUser(A.user, () => pushRoute.POST(request(subscription(endpoint))))).status,
      503,
    );
    process.env.VAPID_PUBLIC_KEY = 'fixture';
    process.env.VAPID_PRIVATE_KEY = 'fixture';
    process.env.VAPID_SUBJECT = 'mailto:test@example.test';
    assert.equal(
      (await asUser(A.user, () => pushRoute.POST(request(subscription(endpoint))))).status,
      201,
    );
    assert.equal(
      (await asUser(A.user, () => pushRoute.POST(request(subscription(endpoint))))).status,
      200,
    );
    assert.equal(
      (await asUser(B.user, () => pushRoute.POST(request(subscription(endpoint))))).status,
      409,
    );
    const sales = await prisma.user.create({
      data: {
        workspaceId: A.workspace.id,
        name: 'Ventas',
        email: `sales-${stamp}@example.test`,
        passwordHash: 'unused-test-hash',
        role: 'SALES',
      },
    });
    const salesEndpoint = `${endpoint}-sales`;
    assert.equal(
      (await asUser(sales, () => pushRoute.POST(request(subscription(salesEndpoint))))).status,
      201,
    );
    assert.equal(
      (await asUser(sales, () => pushRoute.POST(request(subscription(endpoint))))).status,
      409,
    );
    const prefs = {
      notifyHumanAttention: true,
      notifyAssigned: true,
      notifyQuoteApproval: true,
      notifyOperationalIssue: true,
      notifyIncomingMessage: false,
    };
    assert.equal(
      (await asUser(B.user, () => pushRoute.PUT(request({ endpoint, preferences: prefs })))).status,
      404,
    );
    assert.equal(
      (await asUser(A.user, () => pushRoute.PUT(request({ endpoint, preferences: prefs })))).status,
      200,
    );
    const saved = await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint } });
    assert.equal(saved.notifyIncomingMessage, false);
    assert.equal(
      (
        await queuePushEvent({
          kind: 'INCOMING_MESSAGE',
          workspaceId: A.workspace.id,
          userId: A.user.id,
          dedupeKey: `incoming-${stamp}`,
        })
      ).queued,
      0,
    );
    const event = {
      kind: 'QUOTE_APPROVAL' as const,
      workspaceId: A.workspace.id,
      dedupeKey: `quote-${stamp}`,
    };
    await queuePushEvent(event);
    await queuePushEvent(event);
    assert.equal(
      await prisma.job.count({ where: { dedupeKey: `push:${event.dedupeKey}:${saved.id}` } }),
      1,
    );
    const salesSubscription = await prisma.pushSubscription.findUniqueOrThrow({
      where: { endpoint: salesEndpoint },
    });
    assert.equal(
      await prisma.job.count({
        where: { dedupeKey: `push:${event.dedupeKey}:${salesSubscription.id}` },
      }),
      0,
    );
    await prisma.pushSubscription.update({
      where: { id: salesSubscription.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    assert.equal(
      (
        await sendPushJob(
          {
            subscriptionId: salesSubscription.id,
            notification: { title: 'Prueba', body: 'Prueba', url: '/ops', tag: 'test' },
          },
          A.workspace.id,
        )
      ).skipped,
      true,
    );
    assert.equal(await prisma.pushSubscription.count({ where: { id: salesSubscription.id } }), 0);
    assert.equal(
      (await queuePushEvent({ ...event, workspaceId: B.workspace.id, userId: A.user.id })).queued,
      0,
    );
    assert.equal(
      (
        await sendPushJob(
          {
            subscriptionId: saved.id,
            notification: { title: 'Prueba', body: 'Prueba', url: '/ops', tag: 'test' },
          },
          B.workspace.id,
        )
      ).skipped,
      true,
    );
    assert.equal((await (await asUser(B.user, pushRoute.GET)).json()).data.subscriptions.length, 0);
    assert.equal(
      (await (await asUser(B.user, () => pushRoute.DELETE(request({ endpoint })))).json()).data
        .removed,
      false,
    );
    assert.equal(
      (await (await asUser(A.user, () => pushRoute.DELETE(request({ endpoint })))).json()).data
        .removed,
      true,
    );
  });

  await test('Push: altas concurrentes de otro workspace no reemplazan las claves del propietario', async () => {
    const endpoint = `https://push.example.test/race-${stamp}`;
    // Ambas peticiones deben leer "no existe" antes de escribir. Se conserva
    // la consulta real y solo se sincroniza su retorno para forzar la carrera.
    const originalFind = prisma.pushSubscription.findUnique.bind(prisma.pushSubscription);
    let arrivals = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    prisma.pushSubscription.findUnique = (async (args: Parameters<typeof originalFind>[0]) => {
      const result = await originalFind(args);
      if (++arrivals === 2) release();
      await gate;
      return result;
    }) as unknown as typeof prisma.pushSubscription.findUnique;
    const responses = await Promise.all([
      asUser(A.user, () =>
        pushRoute.POST(
          request({
            ...subscription(endpoint),
            keys: { p256dh: 'a'.repeat(30), auth: 'a'.repeat(12) },
          }),
        ),
      ),
      asUser(B.user, () =>
        pushRoute.POST(
          request({
            ...subscription(endpoint),
            keys: { p256dh: 'b'.repeat(30), auth: 'b'.repeat(12) },
          }),
        ),
      ),
    ]).finally(() => {
      prisma.pushSubscription.findUnique = originalFind;
    });
    assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
    const saved = await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint } });
    assert.equal(saved.p256dh, (saved.workspaceId === A.workspace.id ? 'a' : 'b').repeat(30));
  });

  const ruleInput = {
    serviceKey: 'beta-service',
    name: 'Servicio beta',
    intakeSchema: {
      fields: [{ key: 'units', label: 'Unidades', type: 'number', required: true, min: 1 }],
    },
    rules: {
      components: [
        {
          key: 'units',
          label: 'Unidades',
          type: 'PER_UNIT',
          quantityFrom: 'units',
          unitPriceClp: 10000,
        },
      ],
    },
  };
  await test('Reglas: borradores concurrentes conservan versiones únicas', async () => {
    const responses = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        asUser(A.user, () =>
          rulesRoute.POST(request({ ...ruleInput, serviceKey: 'concurrent-service' })),
        ),
      ),
    );
    assert.ok(
      responses.every(
        (response) => response.status === 'fulfilled' && response.value.status === 201,
      ),
    );
    const versions = await prisma.pricingRuleSet.findMany({
      where: { workspaceId: A.workspace.id, serviceKey: 'concurrent-service' },
      orderBy: { version: 'asc' },
    });
    assert.deepEqual(
      versions.map((version) => version.version),
      [1, 2, 3, 4],
    );
    assert.ok(versions.every((version) => version.status === 'DRAFT'));
  });
  await test('Reglas: publicaciones concurrentes dejan una sola versión vigente', async () => {
    const versions = await prisma.pricingRuleSet.findMany({
      where: { workspaceId: A.workspace.id, serviceKey: 'concurrent-service' },
      orderBy: { version: 'asc' },
    });
    assert.equal(versions.length, 4);
    const results = await Promise.allSettled(
      versions.map((version) =>
        asUser(A.user, () => publishRoute.POST(request({}), params(version.id))),
      ),
    );
    assert.ok(
      results.every((result) => result.status === 'fulfilled' && result.value.status === 200),
    );
    assert.equal(
      await prisma.pricingRuleSet.count({
        where: {
          workspaceId: A.workspace.id,
          serviceKey: 'concurrent-service',
          status: 'PUBLISHED',
        },
      }),
      1,
    );
  });
  await test('Cotizador: guardar/publicar, recargar, revisar en carrera, versionar sin heredar aprobación y aislar', async () => {
    const draft = await asUser(A.user, () => rulesRoute.POST(request(ruleInput)));
    assert.equal(draft.status, 201);
    const rule = (await draft.json()).data;
    assert.equal(rule.status, 'DRAFT');
    assert.equal(
      (await asUser(B.user, () => publishRoute.POST(request({}), params(rule.id)))).status,
      404,
    );
    assert.equal(
      (await asUser(A.user, () => publishRoute.POST(request({}), params(rule.id)))).status,
      200,
    );
    const input = {
      workspaceId: A.workspace.id,
      serviceKey: ruleInput.serviceKey,
      inputs: { units: 3 },
      actorId: A.user.id,
    };
    const quote = await createQuote(input);
    const stored = await prisma.quote.findUniqueOrThrow({
      where: { id: quote.id },
      include: { lines: true },
    });
    assert.equal(stored.total, 30000);
    assert.equal(stored.ruleSetId, rule.id);
    assert.equal(stored.lines.length, 1);
    assert.deepEqual(stored.inputs, { units: 3 });
    const review = {
      workspaceId: A.workspace.id,
      quoteId: quote.id,
      reviewer: { id: A.user.id, role: A.user.role },
    };
    await assert.rejects(
      approveQuote({ ...review, workspaceId: B.workspace.id, reviewer: B.user }),
      { code: 'NOT_FOUND' },
    );
    const decisions = await Promise.allSettled([approveQuote(review), rejectQuote(review)]);
    assert.equal(decisions.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      await prisma.approvalRequest.count({ where: { resourceId: quote.id, status: 'PENDING' } }),
      0,
    );
    const versions = await Promise.allSettled([
      createQuote({ ...input, parentQuoteId: quote.id }),
      createQuote({ ...input, parentQuoteId: quote.id }),
    ]);
    assert.equal(versions.filter((r) => r.status === 'fulfilled').length, 1);
    const v2 = await prisma.quote.findFirstOrThrow({
      where: { workspaceId: A.workspace.id, number: quote.number, version: 2 },
    });
    assert.equal(v2.status, 'PENDING_HUMAN_REVIEW');
    assert.equal(v2.reviewerId, null);
    assert.equal(v2.pdfTokenHash, null);
    const foreignContact = await prisma.contact.create({
      data: { workspaceId: B.workspace.id, firstName: 'Ajeno', lastName: 'Beta' },
    });
    await assert.rejects(createQuote({ ...input, contactId: foreignContact.id }), {
      code: 'NOT_FOUND',
    });
    assert.equal(
      (await asUser(A.user, () => archiveRoute.POST(request({}), params(rule.id)))).status,
      200,
    );
    assert.equal(
      (await asUser(A.user, () => publishRoute.POST(request({}), params(rule.id)))).status,
      409,
    );
  });

  await test('Onboarding persistido: modalidad, capacidad del plan y ausencia de plan', async () => {
    for (const businessType of ['SERVICES', 'ECOMMERCE', 'INFOPRODUCT'] as const) {
      await prisma.workspaceProfile.update({
        where: { workspaceId: A.workspace.id },
        data: { businessType },
      });
      const state = await getOnboardingState(A.workspace.id);
      const step = (key: string) => state.steps.find((s) => s.key === key)!;
      assert.equal(step('pagos').level, businessType === 'SERVICES' ? 'OPTIONAL' : 'REQUIRED');
      assert.equal(step('email').level, businessType === 'INFOPRODUCT' ? 'REQUIRED' : 'OPTIONAL');
    }
    const limitedPlan = await prisma.subscriptionPlan.create({
      data: {
        key: `beta-limited-${stamp}`,
        name: 'Sin cotizador',
        priceClp: 1000,
        maxUsers: 2,
        maxContacts: 100,
        capabilities: ['WHATSAPP', 'AI_AGENTS'],
      },
    });
    planIds.push(limitedPlan.id);
    await prisma.workspaceSubscription.updateMany({
      where: { workspaceId: A.workspace.id },
      data: { planId: limitedPlan.id },
    });
    await prisma.workspaceProfile.update({
      where: { workspaceId: A.workspace.id },
      data: { businessType: 'SERVICES' },
    });
    const limited = await getOnboardingState(A.workspace.id);
    assert.equal(limited.steps.find((s) => s.key === 'catalogo')?.level, 'REQUIRED');
    assert.equal(limited.steps.find((s) => s.key === 'catalogo')?.done, false);
    assert.equal(limited.canActivate, false);
    await assert.rejects(
      createQuote({
        workspaceId: A.workspace.id,
        serviceKey: ruleInput.serviceKey,
        inputs: { units: 1 },
      }),
      { code: 'FORBIDDEN' },
    );
    await prisma.workspaceSubscription.deleteMany({ where: { workspaceId: A.workspace.id } });
    const noPlan = await getOnboardingState(A.workspace.id);
    assert.equal(noPlan.canActivate, false);
    assert.equal(noPlan.steps.find((s) => s.key === 'plan')?.done, false);
  });
} finally {
  globalThis.fetch = guardedFetch;
  const assets = await prisma.mediaAsset.findMany({
    where: { workspaceId: { in: workspaceIds }, storageKey: { not: null } },
  });
  const storage = await resolveStorage();
  for (const asset of assets) await storage.remove(asset.storageKey!);
  await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
  await prisma.subscriptionPlan.deleteMany({ where: { id: { in: planIds } } });
  await prisma.webhookEvent.deleteMany({ where: { id: { in: eventIds } } });
  await prisma.$disconnect();
}
console.log(`\n== Beta: ${passed}/${passed + failed} casos OK ==`);
process.exitCode = failed ? 1 : 0;
