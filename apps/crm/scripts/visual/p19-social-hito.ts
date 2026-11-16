/**
 * Hito P19 (crm_pruebas) con Instagram FALSO (la red real está bloqueada por el preload):
 *  1. programar → el tick del cron publica → PUBLISHED con permalink; otro tick no duplica.
 *  2. publicar ahora con error de Meta → FAILED con el motivo → reintentar → PUBLISHED.
 *  3. caída de red → vuelve a SCHEDULED con backoff (reintento 1 de 3).
 * Deja en Visual Flow A una cuenta "QA Instagram" y los posts, para la QA en la UI.
 */
import assert from 'node:assert/strict';
import { prisma } from '../../src/lib/prisma';
import { encryptSecret } from '../../src/lib/crypto';
import { INSTAGRAM_OAUTH_SCOPES } from '../../src/lib/instagram/oauth';
import { publishDueSocialPosts } from '../../src/lib/social/publisher';
import { saveSocialPost, socialPostAction } from '../../src/lib/social/service';

const workspace = await prisma.workspace.findFirstOrThrow({ where: { name: { startsWith: 'Visual Flow A' } }, select: { id: true } });
const owner = await prisma.user.findFirstOrThrow({ where: { email: 'owner-a@visual.test' }, select: { id: true } });
const workspaceId = workspace.id;

const account = await prisma.channelAccount.upsert({
  where: { channel_externalAccountId: { channel: 'INSTAGRAM', externalAccountId: 'qa-ig-p19' } },
  create: { workspaceId, channel: 'INSTAGRAM', connectionMethod: 'OAUTH', externalAccountId: 'qa-ig-p19', displayName: 'QA Instagram', accessTokenEncrypted: encryptSecret('qa-token'), scopes: INSTAGRAM_OAUTH_SCOPES.join(','), status: 'CONNECTED', connectedAt: new Date() },
  update: { workspaceId, status: 'CONNECTED', scopes: INSTAGRAM_OAUTH_SCOPES.join(','), planLimitedAt: null },
});

/** Meta falso: `mode` decide la respuesta de /media. */
let mode: 'ok' | 'meta-error' | 'network' = 'ok';
let mediaCalls = 0;
globalThis.fetch = (async (url: string) => {
  const path = String(url).split('?')[0].replace('https://graph.instagram.com/v21.0/', '');
  if (!String(url).startsWith('https://graph.instagram.com/')) throw new Error(`fetch inesperado: ${url}`);
  if (path === 'qa-ig-p19/media') {
    mediaCalls += 1;
    if (mode === 'network') throw new TypeError('fetch failed');
    if (mode === 'meta-error') return Response.json({ error: { message: 'Only photo or video can be accepted as media type.' } }, { status: 400 });
    return Response.json({ id: `c${mediaCalls}` });
  }
  if (path.startsWith('c')) return Response.json({ status_code: 'FINISHED' });
  if (path === 'qa-ig-p19/media_publish') return Response.json({ id: `m${mediaCalls}` });
  return Response.json({ permalink: `https://www.instagram.com/p/qa-${path}/` });
}) as typeof fetch;

const base = { channelAccountId: account.id, hashtags: ['devocional', 'oracion'], mediaUrl: 'https://example.com/qa.jpg', mediaType: 'IMAGE' as const };
const results: Record<string, unknown> = {};

// 1. Programado → cron
const inOneMinute = new Date(Date.now() + 60_000);
const scheduled = await saveSocialPost(workspaceId, owner.id, { ...base, caption: 'QA P19 · programado', action: 'schedule', scheduledAt: inOneMinute.toISOString() });
assert.equal(scheduled.status, 'SCHEDULED');
const early = await publishDueSocialPosts({ workspaceId });
assert.equal(early.due, 0, 'antes de la hora no se publica');
const tick = await publishDueSocialPosts({ workspaceId, now: new Date(inOneMinute.getTime() + 1000) });
const afterTick = await prisma.socialPost.findFirstOrThrow({ where: { id: scheduled.id, workspaceId } });
assert.equal(afterTick.status, 'PUBLISHED');
const again = await publishDueSocialPosts({ workspaceId, now: new Date(inOneMinute.getTime() + 120_000) });
results.scheduled = { tick, status: afterTick.status, permalink: afterTick.permalink, secondTickDue: again.due };

// 2. Publicar ahora con error de Meta → reintento manual
mode = 'meta-error';
const failed = await saveSocialPost(workspaceId, owner.id, { ...base, caption: 'QA P19 · falla y se reintenta', action: 'publish_now' });
assert.equal(failed.status, 'FAILED');
mode = 'ok';
const retried = await socialPostAction(workspaceId, failed.id, { action: 'retry' });
assert.equal(retried.status, 'PUBLISHED');
results.failedThenRetried = { firstError: failed.lastError, afterRetry: retried.status, history: (retried.history as { event: string }[]).map((h) => h.event) };

// 3. Caída de red → backoff
mode = 'network';
const flaky = await saveSocialPost(workspaceId, owner.id, { ...base, caption: 'QA P19 · red caída, reintenta solo', action: 'publish_now' });
assert.equal(flaky.status, 'SCHEDULED');
assert.equal(flaky.attempts, 1);
results.networkDown = { status: flaky.status, attempts: flaky.attempts, nextAttemptAt: flaky.nextAttemptAt, lastError: flaky.lastError };

// 4. Borrador sin archivo
const draft = await saveSocialPost(workspaceId, owner.id, { ...base, mediaUrl: '', caption: 'QA P19 · borrador', action: 'draft' });
results.draft = draft.status;

console.log(JSON.stringify(results, null, 2));
await prisma.$disconnect();
