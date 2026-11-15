/**
 * Fase D1 — OAuth real de Instagram/Messenger contra transporte FAKE, pero
 * ejecutando el CODIGO real (no InstagramFakeProvider/MessengerFakeProvider):
 * intercambio de OAuth, conexion de ChannelAccount, suscripcion de webhook,
 * ingestion del webhook real, motor de automatizaciones, y envio saliente
 * real (Private Reply / DM) — todo contra respuestas fabricadas, sin
 * Internet. Ningun fetch de este archivo toca una red real.
 *
 * Uso, desde apps/crm:
 *   pnpm exec tsx scripts/smoke-meta-oauth.ts
 */
import './fixtures/test-environment';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { assignCompSubscription } from '../src/lib/billing/subscription-admin';

// Desde P0-C la mensajeria exige plan pago: los workspaces del smoke van en SCALE (COMP).
const scale = (workspaceId: string) => assignCompSubscription({ workspaceId, planCode: 'SCALE', via: 'cli', reason: 'smoke meta oauth' });
import { decryptSecret, encryptSecret } from '../src/lib/crypto';
import {
  exchangeInstagramOAuthCode,
  exchangeForLongLivedInstagramToken,
  fetchInstagramProfile,
  type InstagramOAuthConfig,
} from '../src/lib/instagram/oauth';
import { ensureInstagramWebhookSubscription } from '../src/lib/instagram/webhook-subscription';
import { ingestInstagramWebhook } from '../src/lib/instagram/inbound';
import {
  exchangeMessengerOAuthCode,
  exchangeForLongLivedUserToken,
  fetchManagedPages,
  type MessengerOAuthConfig,
} from '../src/lib/messenger/oauth';
import { ensureMessengerWebhookSubscription } from '../src/lib/messenger/webhook-subscription';
import { ingestMessengerWebhook } from '../src/lib/messenger/inbound';
import { processChannelEvent } from '../src/lib/channels/process';
import { generateQuickFlow } from '../src/lib/automations/catalog';
import { createFlow, saveFlow } from '../src/lib/automations/service';
import { applyApprovedPayment } from '../src/lib/domain/lifecycle';
import { sendChannelMessage } from '../src/lib/channels/outbound';

let checks = 0;
function check(name: string, value: unknown) { assert.ok(value, name); checks++; console.log(`PASS ${name}`); }

/** Enruta URLs fabricadas a respuestas fabricadas — ninguna llega a la red. */
function fakeMetaTransport(handlers: Record<string, () => unknown>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    for (const [prefix, handler] of Object.entries(handlers)) {
      if (`${url.origin}${url.pathname}` === prefix || url.href.startsWith(prefix)) {
        return new Response(JSON.stringify(handler()), { status: 200 });
      }
    }
    throw new Error(`fakeMetaTransport: ruta no fabricada — ${url.href}`);
  }) as typeof fetch;
}

const ids: string[] = [];
try {
  // ------------------------------------------------------------------
  // INSTAGRAM: OAuth -> conexion -> webhook de comentario -> automatizacion
  // -> Private Reply real (no un SEND_DM generico).
  // ------------------------------------------------------------------
  const igConfig: InstagramOAuthConfig = { appId: 'test-ig-app', appSecret: 'test-ig-secret', baseUrl: 'http://localhost:3101' };
  const igInstagramAccountId = `ig_${randomUUID()}`;

  const igTransport = fakeMetaTransport({
    'https://api.instagram.com/oauth/access_token': () => ({ access_token: 'short-lived-ig', user_id: igInstagramAccountId }),
    'https://graph.instagram.com/access_token': () => ({ access_token: 'long-lived-ig-token', expires_in: 5_184_000 }),
    'https://graph.instagram.com/v21.0/me': () => ({ user_id: igInstagramAccountId, username: 'negocio_demo' }),
    [`https://graph.instagram.com/v21.0/${igInstagramAccountId}/subscribed_apps`]: () => ({ success: true }),
  });

  const igShortLived = await exchangeInstagramOAuthCode({ config: igConfig, code: 'fake-ig-code', fetchImpl: igTransport });
  check('Instagram: exchange devuelve token de corta duracion', igShortLived.accessToken === 'short-lived-ig' && igShortLived.userId === igInstagramAccountId);

  const igLongLived = await exchangeForLongLivedInstagramToken({ shortLivedAccessToken: igShortLived.accessToken, appSecret: igConfig.appSecret, fetchImpl: igTransport });
  check('Instagram: token se extiende a larga duracion', igLongLived.accessToken === 'long-lived-ig-token' && igLongLived.expiresInSeconds > 0);

  const igProfile = await fetchInstagramProfile({ accessToken: igLongLived.accessToken, fetchImpl: igTransport });
  check('Instagram: identidad de la cuenta profesional resuelta', igProfile.id === igInstagramAccountId && igProfile.username === 'negocio_demo');

  const { workspace: igWorkspace, user: igUser } = await createCustomerWorkspace({ companyName: `Meta IG ${randomUUID()}`, ownerName: 'Owner', email: `${randomUUID()}@meta-oauth.test`, password: 'OnlyLocal#MetaOAuth!' });
  await scale(igWorkspace.id);
  ids.push(igWorkspace.id);
  await prisma.workspaceActivation.upsert({ where: { workspaceId: igWorkspace.id }, create: { workspaceId: igWorkspace.id, status: 'ACTIVE' }, update: { status: 'ACTIVE' } });

  // Mismo shape que el callback real (route.ts) crearia — reproducido aqui
  // porque el route en si necesita cookies/sesion HTTP, fuera del alcance de
  // un script; la logica de persistencia SI es identica.
  const igAccount = await prisma.channelAccount.create({
    data: {
      workspaceId: igWorkspace.id,
      channel: 'INSTAGRAM',
      connectionMethod: 'OAUTH',
      externalAccountId: igProfile.id,
      displayName: igProfile.username,
      accessTokenEncrypted: encryptSecret(igLongLived.accessToken),
      accessTokenExpiresAt: new Date(Date.now() + igLongLived.expiresInSeconds * 1000),
      capabilities: [],
      status: 'CONNECTED',
      connectedAt: new Date(),
      lastVerifiedAt: new Date(),
      metadata: { authorization: { mechanism: 'INSTAGRAM_LOGIN', tokenType: 'INSTAGRAM_USER', instagramAccountId: igProfile.id } },
    },
  });
  check('Instagram: ChannelAccount persistida con token cifrado (no en claro)', igAccount.accessTokenEncrypted !== igLongLived.accessToken && decryptSecret(igAccount.accessTokenEncrypted!) === igLongLived.accessToken);

  // Duplicado cross-tenant: la MISMA cuenta de Instagram no puede quedar en
  // dos workspaces — el unique constraint de Prisma es la ultima linea de
  // defensa (spec Fase D1, seccion 8).
  const { workspace: otherWorkspace } = await createCustomerWorkspace({ companyName: `Otro ${randomUUID()}`, ownerName: 'Owner', email: `${randomUUID()}@meta-oauth.test`, password: 'OnlyLocal#MetaOAuth!' });
  await scale(otherWorkspace.id);
  ids.push(otherWorkspace.id);
  await assert.rejects(
    () => prisma.channelAccount.create({ data: { workspaceId: otherWorkspace.id, channel: 'INSTAGRAM', externalAccountId: igProfile.id, status: 'CONNECTED' } }),
    /Unique constraint/,
  );
  check('Instagram: cuenta duplicada cross-tenant es rechazada por el unique constraint', true);

  const igSubscription = await ensureInstagramWebhookSubscription({ instagramAccountId: igProfile.id, accessToken: igLongLived.accessToken, fetchImpl: igTransport });
  check('Instagram: suscripcion de webhook confirmada', igSubscription.subscribed);

  // Flow real: comentario con keyword "GUIA" -> respuesta publica opcional +
  // Private Reply (nunca un SEND_DM generico).
  const igGraph = generateQuickFlow({ kind: 'comment', accountId: igAccount.id, keyword: 'GUIA', publicReply: 'Te la envie por privado.', text: 'Aqui tienes tu guia.', tag: 'guia' });
  const igFlow = await createFlow(igWorkspace.id, igUser.id, 'Comentario -> DM', 'INSTAGRAM', igGraph);
  await saveFlow(igWorkspace.id, igFlow.id, igUser.id, { action: 'publish', versionId: igFlow.versions[0].id });

  // Webhook de comentario REAL de Meta, con la forma documentada
  // (`changes[].field === 'comments'`) — se procesa con el parser real, no
  // uno simplificado para el test.
  const igCommentId = `comment_${randomUUID()}`;
  const igCommenterId = `ig_user_${randomUUID()}`;
  const igIngest = await ingestInstagramWebhook({
    object: 'instagram',
    entry: [{ id: igProfile.id, changes: [{ field: 'comments', value: { id: igCommentId, text: 'GUIA porfa', from: { id: igCommenterId, username: 'cliente_ig' }, media: { id: 'post_1' } } }] }],
  });
  check('Instagram: webhook de comentario normalizado a 1 ChannelEvent', igIngest.events === 1);

  const igEvent = await prisma.channelEvent.findFirstOrThrow({ where: { workspaceId: igWorkspace.id, channelAccountId: igAccount.id }, orderBy: { createdAt: 'desc' } });
  await processChannelEvent(igEvent.id);

  const igRun = await prisma.automationFlowRun.findFirstOrThrow({ where: { workspaceId: igWorkspace.id, flowId: igFlow.id } });
  check('Instagram: el comentario arranco un Run del flujo publicado', Boolean(igRun));

  // Envio saliente real: interceptamos fetch global para este bloque, ya que
  // instagram/client.ts llama a `fetch` directo (no inyectable) — se
  // restaura inmediatamente despues, sin dejar el mock activo para el resto
  // del proceso.
  const realFetch = globalThis.fetch;
  const sentRequests: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    sentRequests.push(url.pathname);
    if (url.pathname === `/v21.0/${igCommentId}/private_replies`) return new Response(JSON.stringify({ message_id: `mid.${randomUUID()}` }), { status: 200 });
    if (url.pathname === `/v21.0/${igCommentId}/replies`) return new Response(JSON.stringify({ id: `reply.${randomUUID()}` }), { status: 200 });
    throw new Error(`fetch real inesperado en el test: ${url.href}`);
  }) as typeof fetch;
  try {
    const conversation = await prisma.conversation.findFirstOrThrow({ where: { workspaceId: igWorkspace.id, channelAccountId: igAccount.id } });
    await sendChannelMessage({ workspaceId: igWorkspace.id, conversationId: conversation.id, text: 'Aqui tienes tu guia.', delivery: 'PRIVATE_REPLY', commentId: igCommentId, senderType: 'USER' });
    check('Instagram: Private Reply uso el endpoint oficial /private_replies, no /me/messages', sentRequests.includes(`/v21.0/${igCommentId}/private_replies`));
  } finally {
    globalThis.fetch = realFetch;
  }

  // P11: trigger "Compra aprobada" + accion "Notificar al equipo". Un webhook
  // de pago repetido no arranca un segundo run; otro pago si.
  const buyer = await prisma.conversation.findFirstOrThrow({ where: { workspaceId: igWorkspace.id, channelAccountId: igAccount.id }, select: { contactId: true } });
  const payGraph = {
    trigger: { type: 'PAYMENT_APPROVED' as const, accountId: igAccount.id },
    nodes: [
      { id: 'notify', type: 'ACTION' as const, action: 'NOTIFY_STAFF' as const, params: {} },
      { id: 'end', type: 'END' as const },
    ],
    edges: [{ id: 'edge-0', from: 'notify', to: 'end' }],
  };
  const payFlow = await createFlow(igWorkspace.id, igUser.id, 'Compra -> aviso', 'INSTAGRAM', payGraph);
  await saveFlow(igWorkspace.id, payFlow.id, igUser.id, { action: 'publish', versionId: payFlow.versions[0].id });
  const paymentId = `pay_${randomUUID()}`;
  await applyApprovedPayment({ workspaceId: igWorkspace.id, contactId: buyer.contactId, paymentId });
  await applyApprovedPayment({ workspaceId: igWorkspace.id, contactId: buyer.contactId, paymentId });
  check('P11: compra aprobada arranco 1 run aunque el webhook llego 2 veces', (await prisma.automationFlowRun.count({ where: { workspaceId: igWorkspace.id, flowId: payFlow.id } })) === 1);
  await applyApprovedPayment({ workspaceId: igWorkspace.id, contactId: buyer.contactId, paymentId: `pay_${randomUUID()}` });
  check('P11: un segundo pago arranco otro run', (await prisma.automationFlowRun.count({ where: { workspaceId: igWorkspace.id, flowId: payFlow.id } })) === 2);

  // ------------------------------------------------------------------
  // MESSENGER: OAuth -> DOS Pages devueltas -> se elige la Page 2 (nunca la
  // primera en silencio) -> DM ordinario respeta la ventana de 24h.
  // ------------------------------------------------------------------
  const msgrConfig: MessengerOAuthConfig = { appId: 'test-fb-app', appSecret: 'test-fb-secret', baseUrl: 'http://localhost:3101' };
  const page1Id = `page1_${randomUUID()}`;
  const page2Id = `page2_${randomUUID()}`;
  const msgrTransport = fakeMetaTransport({
    'https://graph.facebook.com/v21.0/oauth/access_token': () => ({ access_token: 'long-lived-user-token' }),
    'https://graph.facebook.com/v21.0/me/accounts': () => ({ data: [{ id: page1Id, name: 'Pagina Uno', access_token: 'page1-token' }, { id: page2Id, name: 'Pagina Dos', access_token: 'page2-token' }] }),
    [`https://graph.facebook.com/v21.0/${page2Id}/subscribed_apps`]: () => ({ success: true }),
  });

  const msgrShortLived = await exchangeMessengerOAuthCode({ config: msgrConfig, code: 'fake-fb-code', fetchImpl: msgrTransport });
  const msgrLongLived = await exchangeForLongLivedUserToken({ config: msgrConfig, shortLivedAccessToken: msgrShortLived.accessToken, fetchImpl: msgrTransport });
  const pages = await fetchManagedPages({ userAccessToken: msgrLongLived.accessToken, fetchImpl: msgrTransport });
  check('Messenger: /me/accounts devuelve las Pages administradas, sin auto-elegir', pages.length === 2 && pages[0].id === page1Id && pages[1].id === page2Id);

  const chosenPage = pages[1]; // Selecciona explicitamente la Page 2, no la primera.
  const { workspace: msgrWorkspace, user: msgrUser } = await createCustomerWorkspace({ companyName: `Meta Msgr ${randomUUID()}`, ownerName: 'Owner', email: `${randomUUID()}@meta-oauth.test`, password: 'OnlyLocal#MetaOAuth!' });
  await scale(msgrWorkspace.id);
  ids.push(msgrWorkspace.id);
  await prisma.workspaceActivation.upsert({ where: { workspaceId: msgrWorkspace.id }, create: { workspaceId: msgrWorkspace.id, status: 'ACTIVE' }, update: { status: 'ACTIVE' } });
  const msgrAccount = await prisma.channelAccount.create({
    data: {
      workspaceId: msgrWorkspace.id,
      channel: 'MESSENGER',
      connectionMethod: 'OAUTH',
      externalAccountId: chosenPage.id,
      displayName: chosenPage.name,
      accessTokenEncrypted: encryptSecret(chosenPage.accessToken),
      capabilities: [],
      status: 'CONNECTED',
      connectedAt: new Date(),
      lastVerifiedAt: new Date(),
      metadata: { authorization: { mechanism: 'FACEBOOK_LOGIN', tokenType: 'PAGE', pageId: chosenPage.id } },
    },
  });
  check('Messenger: se conecto la Page 2 elegida, no la 1', msgrAccount.externalAccountId === page2Id);

  const msgrSubscription = await ensureMessengerWebhookSubscription({ pageId: chosenPage.id, pageAccessToken: chosenPage.accessToken, fetchImpl: msgrTransport });
  check('Messenger: suscripcion de webhook de la Page confirmada', msgrSubscription.subscribed);

  const msgrSenderId = `psid_${randomUUID()}`;
  const msgrIngest = await ingestMessengerWebhook({ object: 'page', entry: [{ id: chosenPage.id, messaging: [{ sender: { id: msgrSenderId }, message: { text: 'Hola, necesito ayuda' } }] }] });
  check('Messenger: webhook de DM normalizado a 1 ChannelEvent', msgrIngest.events === 1);
  const msgrEvent = await prisma.channelEvent.findFirstOrThrow({ where: { workspaceId: msgrWorkspace.id, channelAccountId: msgrAccount.id }, orderBy: { createdAt: 'desc' } });
  await processChannelEvent(msgrEvent.id);

  const msgrConversation = await prisma.conversation.findFirstOrThrow({ where: { workspaceId: msgrWorkspace.id, channelAccountId: msgrAccount.id } });
  check('Messenger: el DM entrante abrio la ventana de mensajeria de 24h', Boolean(msgrConversation.customerServiceWindowEndsAt) && msgrConversation.customerServiceWindowEndsAt!.getTime() > Date.now());

  // Dentro de la ventana: el envio ordinario debe funcionar.
  const realFetch2 = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname === '/v21.0/me/messages') return new Response(JSON.stringify({ message_id: `mid.${randomUUID()}` }), { status: 200 });
    throw new Error(`fetch real inesperado en el test: ${url.href}`);
  }) as typeof fetch;
  try {
    await sendChannelMessage({ workspaceId: msgrWorkspace.id, conversationId: msgrConversation.id, text: 'Hola! En que te ayudo?', senderType: 'USER' });
    check('Messenger: DM ordinario permitido dentro de la ventana de 24h', true);
  } finally {
    globalThis.fetch = realFetch2;
  }

  // Fuera de la ventana (o sin ella): un DM arbitrario debe rechazarse — el
  // motor de automatizaciones NO puede saltarse esta regla solo porque
  // conoce el externalUserId (spec Fase D1, seccion 11).
  await prisma.conversation.update({ where: { id: msgrConversation.id }, data: { customerServiceWindowEndsAt: new Date(Date.now() - 1000) } });
  await assert.rejects(
    () => sendChannelMessage({ workspaceId: msgrWorkspace.id, conversationId: msgrConversation.id, text: 'Mensaje no solicitado', senderType: 'USER' }),
    /Ventana de mensajería cerrada/,
  );
  check('Messenger: un DM fuera de la ventana de mensajeria es rechazado, no se envia "a ciegas"', true);

  console.log(`\n== Resultado: ${checks}/${checks} pruebas OK ==`);
} finally {
  if (ids.length) {
    await prisma.workspace.deleteMany({ where: { id: { in: ids } } });
    console.log(`Limpieza: ${ids.length} workspaces de prueba eliminados (cascade).`);
  }
  await prisma.$disconnect();
}
