/**
 * Hito P29 (crm_pruebas) con TikTok FALSO (la red real está bloqueada por el preload):
 *  1. programar un video → tick: TikTok sigue procesando → SCHEDULED con el mismo publish_id;
 *     tick siguiente → PUBLISHED con id público y share_url; init se llamó UNA vez.
 *  2. app sin auditoría → se pide SELF_ONLY; publicado privado queda con `publish:<id>` y sin métricas.
 *  3. error de TikTok (dominio sin verificar) → FAILED con texto claro, sin reintento.
 *  4. token vencido → se refresca y se guarda el refresh_token NUEVO.
 *  5. refresh rechazado → cuenta REAUTH_REQUIRED y la publicación falla sin reintento.
 *  6. métricas en vivo del video público.
 *  7. TikTok sin cuenta sigue siendo solo borrador; con imagen no se programa.
 * Deja en Visual Flow A la cuenta "QA TikTok" (CONNECTED) y los posts, para la QA en la UI.
 *
 * Uso (desde apps/crm): NODE_OPTIONS="--require ./scripts/visual/preload.cjs" node node_modules/tsx/dist/cli.mjs scripts/visual/p29-tiktok-hito.ts
 */
import assert from 'node:assert/strict';
import { prisma } from '../../src/lib/prisma';
import { decryptSecret, encryptSecret } from '../../src/lib/crypto';
import { TIKTOK_OAUTH_SCOPES } from '../../src/lib/tiktok/oauth';
import { publishDueSocialPosts } from '../../src/lib/social/publisher';
import { SocialPostError, saveSocialPost } from '../../src/lib/social/service';
import { fetchTikTokMetrics, publishToTikTok } from '../../src/lib/social/tiktok-publish';

process.env.TIKTOK_CLIENT_KEY ||= 'qa-client-key';
process.env.TIKTOK_CLIENT_SECRET ||= 'qa-client-secret';

const workspace = await prisma.workspace.findFirstOrThrow({ where: { name: { startsWith: 'Visual Flow A' } }, select: { id: true } });
const owner = await prisma.user.findFirstOrThrow({ where: { email: 'owner-a@visual.test' }, select: { id: true } });
const workspaceId = workspace.id;
const tokenFields = (access: string, refresh: string, expiresAt: Date) => ({
  accessTokenEncrypted: encryptSecret(access), refreshTokenEncrypted: encryptSecret(refresh), accessTokenExpiresAt: expiresAt,
});
const account = await prisma.channelAccount.upsert({
  where: { channel_externalAccountId: { channel: 'TIKTOK', externalAccountId: 'qa-tt-p29' } },
  create: { workspaceId, channel: 'TIKTOK', connectionMethod: 'OAUTH', externalAccountId: 'qa-tt-p29', displayName: 'QA TikTok', scopes: TIKTOK_OAUTH_SCOPES.join(','), status: 'CONNECTED', connectedAt: new Date(), ...tokenFields('qa-access', 'qa-refresh', new Date(Date.now() + 86_400_000)) },
  update: { workspaceId, status: 'CONNECTED', scopes: TIKTOK_OAUTH_SCOPES.join(','), planLimitedAt: null, lastError: null, lastErrorCode: null, ...tokenFields('qa-access', 'qa-refresh', new Date(Date.now() + 86_400_000)) },
});

/** TikTok falso. `statusQueue` = lo que devuelve status/fetch en cada llamada. */
const calls: { path: string; body: Record<string, unknown> | null; auth: string | null }[] = [];
let initError: string | null = null;
let refreshFails = false;
let statusQueue: Array<Record<string, unknown>> = [];
let publishCount = 0;
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  const href = String(url);
  if (!href.startsWith('https://open.tiktokapis.com/v2')) throw new Error(`fetch inesperado: ${href}`);
  const path = href.replace('https://open.tiktokapis.com/v2', '').split('?')[0];
  const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
  calls.push({ path, body, auth: new Headers(init?.headers).get('authorization') });
  const ok = (data: unknown) => Response.json({ data, error: { code: 'ok', message: '' } });
  if (path === '/oauth/token/') {
    if (refreshFails) return Response.json({ error: 'invalid_grant', error_description: 'refresh_token revocado' }, { status: 400 });
    return Response.json({ access_token: 'qa-access-2', expires_in: 86_400, refresh_token: 'qa-refresh-2', refresh_expires_in: 31_536_000, open_id: 'qa-tt-p29', scope: TIKTOK_OAUTH_SCOPES.join(',') });
  }
  if (path === '/post/publish/creator_info/query/') return ok({ privacy_level_options: ['PUBLIC_TO_EVERYONE', 'SELF_ONLY'] });
  if (path === '/post/publish/video/init/') {
    if (initError) return Response.json({ data: {}, error: { code: initError, message: 'x' } }, { status: 403 });
    publishCount += 1;
    return ok({ publish_id: `v_pub_${publishCount}` });
  }
  if (path === '/post/publish/status/fetch/') return ok(statusQueue.shift() ?? { status: 'PROCESSING_DOWNLOAD' });
  if (path === '/video/query/') return ok({ videos: [{ id: '7311', share_url: 'https://www.tiktok.com/@qa/video/7311', view_count: 120, like_count: 9, comment_count: 2, share_count: 1 }] });
  if (path === '/user/info/') return ok({ user: { open_id: 'qa-tt-p29', display_name: 'QA TikTok', follower_count: 340 } });
  throw new Error(`ruta TikTok no simulada: ${path}`);
}) as typeof fetch;

const noSleep = { sleep: async () => {} };
const publish: NonNullable<NonNullable<Parameters<typeof publishDueSocialPosts>[0]>['publish']> = (input) => publishToTikTok(input, { ...noSleep, audited: true });
const base = { network: 'TIKTOK' as const, channelAccountId: account.id, hashtags: ['devocional'], mediaUrl: 'https://example.com/qa.mp4', mediaType: 'REEL' as const };
const results: Record<string, unknown> = {};
const at = (ms: number) => new Date(Date.now() + ms);

// 1. Programado → procesando → publicado, sin subir dos veces.
const when = at(60_000);
const scheduled = await saveSocialPost(workspaceId, owner.id, { ...base, caption: 'QA P29 · programado', action: 'schedule', scheduledAt: when.toISOString() });
assert.equal(scheduled.status, 'SCHEDULED');
statusQueue = Array(5).fill({ status: 'PROCESSING_UPLOAD' });
await publishDueSocialPosts({ workspaceId, now: at(61_000), publish });
const processing = await prisma.socialPost.findFirstOrThrow({ where: { id: scheduled.id } });
assert.deepEqual([processing.status, processing.containerId], ['SCHEDULED', 'v_pub_1'], 'sigue procesando: conserva el publish_id');
assert.ok(processing.nextAttemptAt, 'reintento con backoff');
statusQueue = [{ status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [7311] }];
await publishDueSocialPosts({ workspaceId, now: new Date(processing.nextAttemptAt!.getTime() + 1000), publish });
const published = await prisma.socialPost.findFirstOrThrow({ where: { id: scheduled.id } });
assert.deepEqual([published.status, published.externalPostId, published.permalink], ['PUBLISHED', '7311', 'https://www.tiktok.com/@qa/video/7311']);
assert.equal(calls.filter((c) => c.path === '/post/publish/video/init/').length, 1, 'init una sola vez');
const initBody = calls.find((c) => c.path === '/post/publish/video/init/')!.body as { post_info: { privacy_level: string; title: string }; source_info: { source: string; video_url: string } };
assert.deepEqual([initBody.post_info.privacy_level, initBody.source_info.source, initBody.source_info.video_url], ['PUBLIC_TO_EVERYONE', 'PULL_FROM_URL', base.mediaUrl]);
assert.match(initBody.post_info.title, /QA P29 · programado\n\n#devocional/);
assert.equal(calls.find((c) => c.path === '/post/publish/video/init/')!.auth, 'Bearer qa-access');
results.scheduled = { status: published.status, externalPostId: published.externalPostId, permalink: published.permalink, history: (published.history as { event: string }[]).map((h) => h.event) };

// 2. Sin auditoría → privado.
calls.length = 0;
statusQueue = [{ status: 'PUBLISH_COMPLETE' }];
const privatePost = await saveSocialPost(workspaceId, owner.id, { ...base, caption: 'QA P29 · privado (app sin auditar)', action: 'draft' });
const privateResult = await publishToTikTok({ account: { ...account, accessTokenEncrypted: account.accessTokenEncrypted }, caption: 'x', mediaUrl: base.mediaUrl, mediaType: 'REEL', containerId: null }, { ...noSleep, audited: false });
assert.ok(privateResult.ok && privateResult.externalPostId.startsWith('publish:'));
assert.equal((calls.find((c) => c.path === '/post/publish/video/init/')!.body as { post_info: { privacy_level: string } }).post_info.privacy_level, 'SELF_ONLY');
const privateMetrics = await fetchTikTokMetrics({ channelAccountId: account.id, externalPostId: privateResult.externalPostId });
assert.ok(!privateMetrics.ok && /privado/.test(privateMetrics.error));
await prisma.socialPost.delete({ where: { id: privatePost.id } });
results.private = { privacy: 'SELF_ONLY', externalPostId: privateResult.externalPostId, metrics: privateMetrics.ok ? null : privateMetrics.error };

// 3. Error de TikTok → FAILED claro.
initError = 'url_ownership_unverified';
const failed = await saveSocialPost(workspaceId, owner.id, { ...base, caption: 'QA P29 · dominio sin verificar', action: 'publish_now' });
initError = null;
assert.equal(failed.status, 'FAILED');
assert.match(failed.lastError ?? '', /verifica el dominio/);
results.failed = { status: failed.status, lastError: failed.lastError };

// 4. Token vencido → refresh con rotación del refresh_token.
await prisma.channelAccount.update({ where: { id: account.id }, data: { accessTokenExpiresAt: new Date(Date.now() - 1000) } });
calls.length = 0;
statusQueue = [{ status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [7312] }];
const refreshed = await saveSocialPost(workspaceId, owner.id, { ...base, caption: 'QA P29 · tras refrescar el token', action: 'publish_now' });
const afterRefresh = await prisma.channelAccount.findUniqueOrThrow({ where: { id: account.id } });
assert.equal(refreshed.status, 'PUBLISHED');
assert.deepEqual([decryptSecret(afterRefresh.accessTokenEncrypted!), decryptSecret(afterRefresh.refreshTokenEncrypted!)], ['qa-access-2', 'qa-refresh-2']);
assert.equal(calls.find((c) => c.path === '/post/publish/video/init/')!.auth, 'Bearer qa-access-2');
results.refresh = { status: refreshed.status, rotated: true };

// 5. Refresh rechazado → REAUTH_REQUIRED.
await prisma.channelAccount.update({ where: { id: account.id }, data: { accessTokenExpiresAt: new Date(Date.now() - 1000) } });
refreshFails = true;
const reauth = await saveSocialPost(workspaceId, owner.id, { ...base, caption: 'QA P29 · token revocado', action: 'publish_now' });
refreshFails = false;
const revoked = await prisma.channelAccount.findUniqueOrThrow({ where: { id: account.id } });
assert.deepEqual([reauth.status, revoked.status], ['FAILED', 'REAUTH_REQUIRED']);
assert.match(reauth.lastError ?? '', /refresh_token revocado/);
results.reauth = { post: reauth.status, account: revoked.status, lastError: reauth.lastError };
// Se deja la cuenta sana para la QA en la UI.
await prisma.channelAccount.update({ where: { id: account.id }, data: { status: 'CONNECTED', lastError: null, lastErrorCode: null, ...tokenFields('qa-access', 'qa-refresh', new Date(Date.now() + 86_400_000)) } });

// 6. Métricas en vivo.
const metrics = await fetchTikTokMetrics({ channelAccountId: account.id, externalPostId: '7311' });
assert.ok(metrics.ok);
assert.deepEqual(metrics.metrics, { views: 120, likes: 9, comments: 2, shares: 1, followers: 340 });
results.metrics = metrics.metrics;

// 7. Sin cuenta = solo borrador; con imagen no se programa.
await assert.rejects(saveSocialPost(workspaceId, owner.id, { ...base, channelAccountId: undefined, caption: 'QA P29 · sin cuenta', action: 'schedule', scheduledAt: at(3_600_000).toISOString() }), (e) => e instanceof SocialPostError && /cuenta de TikTok conectada/.test(e.message));
await assert.rejects(saveSocialPost(workspaceId, owner.id, { ...base, mediaUrl: 'https://example.com/qa.jpg', mediaType: 'IMAGE', caption: 'QA P29 · imagen', action: 'schedule', scheduledAt: at(3_600_000).toISOString() }), (e) => e instanceof SocialPostError && /elige un video/.test(e.message));
results.guards = 'sin cuenta y con imagen: rechazados';

console.log(JSON.stringify(results, null, 2));
console.log('HITO P29 LOCAL OK (TikTok simulado)');
await prisma.$disconnect();
