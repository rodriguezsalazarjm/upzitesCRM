import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

process.env.INTEGRATION_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
// Solo funciones puras y fetch falso: el cliente de base nunca conecta.
process.env.DATABASE_URL ??= 'postgresql://unused@127.0.0.1:1/unused';

const { encryptSecret } = await import('../crypto');
const { INSTAGRAM_PUBLISH_SCOPE, publishToInstagram } = await import('./instagram-publish');
const { MAX_ATTEMPTS, appendHistory, composeCaption, failureTransition } = await import('./publisher');
const { validateForAction } = await import('./service');

const now = new Date('2026-11-16T12:00:00Z');
const account = { externalAccountId: 'ig-1', accessTokenEncrypted: encryptSecret('tok'), scopes: `instagram_business_basic,${INSTAGRAM_PUBLISH_SCOPE}` };
const noSleep = async () => {};

function fakeGraph(responses: Record<string, unknown>[]) {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${String(url).split('?')[0].replace('https://graph.instagram.com/v21.0/', '')}`);
    const body = responses.shift() ?? {};
    return new Response(JSON.stringify(body), { status: 'error' in body ? 400 : 200 });
  }) as typeof fetch;
  return calls;
}

test('P19: reintentos con backoff y tope', () => {
  assert.deepEqual(failureTransition(0, true, now), { status: 'SCHEDULED', attempts: 1, nextAttemptAt: new Date('2026-11-16T12:01:00Z') });
  assert.equal(failureTransition(1, true, now).nextAttemptAt?.toISOString(), '2026-11-16T12:05:00.000Z');
  assert.equal(failureTransition(MAX_ATTEMPTS - 1, true, now).status, 'FAILED');
  assert.equal(failureTransition(0, false, now).status, 'FAILED', 'un error definitivo no se reintenta');
});

test('P19: texto, hashtags, historial y validación por acción', () => {
  assert.equal(composeCaption(' Hola ', ['#fe', 'oracion']), 'Hola\n\n#fe #oracion');
  assert.equal(appendHistory(Array.from({ length: 40 }, () => ({ at: '', event: 'x' })), 'published', undefined, now).length, 30);
  const base = { channelAccountId: 'a', caption: 'x', hashtags: [], mediaUrl: '', mediaType: 'IMAGE' as const };
  assert.equal(validateForAction({ ...base, action: 'draft' }, now), null, 'un borrador puede no tener archivo');
  assert.match(validateForAction({ ...base, action: 'publish_now' }, now)!, /imagen o un video/);
  assert.match(validateForAction({ ...base, mediaUrl: 'https://x/y.jpg', action: 'schedule', scheduledAt: '2026-11-16T10:00:00Z' }, now)!, /ya pasó/);
  assert.equal(validateForAction({ ...base, mediaUrl: 'https://x/y.jpg', action: 'schedule', scheduledAt: '2026-11-17T10:00:00Z' }, now), null);
  assert.match(validateForAction({ ...base, caption: 'a'.repeat(2195), hashtags: ['abcdef'], action: 'draft' }, now)!, /2200/);
});

test('P19: Instagram imagen = contenedor → estado → publicar → permalink', async () => {
  const calls = fakeGraph([{ id: 'c1' }, { status_code: 'FINISHED' }, { id: 'm1' }, { permalink: 'https://instagram.com/p/m1' }]);
  const result = await publishToInstagram({ account, caption: 'hola', mediaUrl: 'https://x/y.jpg', mediaType: 'IMAGE', containerId: null }, noSleep);
  assert.deepEqual(result, { ok: true, externalPostId: 'm1', permalink: 'https://instagram.com/p/m1' });
  assert.deepEqual(calls, ['POST ig-1/media', 'GET c1', 'POST ig-1/media_publish', 'GET m1']);
});

test('P19: reel en proceso deja el contenedor para reintentar sin resubir', async () => {
  fakeGraph([{ id: 'c2' }, ...Array.from({ length: 5 }, () => ({ status_code: 'IN_PROGRESS' }))]);
  const pending = await publishToInstagram({ account, caption: '', mediaUrl: 'https://x/v.mp4', mediaType: 'REEL', containerId: null }, noSleep);
  assert.deepEqual(pending, { ok: false, error: 'Instagram sigue procesando el archivo; se reintenta solo.', retryable: true, containerId: 'c2' });
  const calls = fakeGraph([{ status_code: 'FINISHED' }, { id: 'm2' }, {}]);
  const done = await publishToInstagram({ account, caption: '', mediaUrl: 'https://x/v.mp4', mediaType: 'REEL', containerId: 'c2' }, noSleep);
  assert.equal(done.ok, true);
  assert.equal(calls[0], 'GET c2', 'reutiliza el contenedor');
});

test('P19: errores de Meta y permisos se muestran y no se reintentan', async () => {
  fakeGraph([{ error: { message: 'Media URL inválida' } }]);
  assert.deepEqual(await publishToInstagram({ account, caption: '', mediaUrl: 'https://x/y.jpg', mediaType: 'IMAGE', containerId: null }, noSleep), { ok: false, error: 'Instagram: Media URL inválida', retryable: false });
  const noScope = await publishToInstagram({ account: { ...account, scopes: 'instagram_business_basic' }, caption: '', mediaUrl: 'https://x/y.jpg', mediaType: 'IMAGE', containerId: null }, noSleep);
  assert.equal(noScope.ok, false);
  assert.match(!noScope.ok ? noScope.error : '', /Reconecta Instagram/);
});
