import assert from 'node:assert/strict';
import { test } from 'node:test';

// Solo funciones puras: el cliente de base nunca conecta.
process.env.DATABASE_URL ??= 'postgresql://unused@127.0.0.1:1/unused';

const { contentMix, parseSuggestions } = await import('./ai-content');
const { validateForAction } = await import('./service');

test('P23: la respuesta del modelo se valida y limpia', () => {
  const raw = 'Claro:\n```json\n' + JSON.stringify({
    suggestions: [
      { network: 'tiktok', format: 'IMAGE', text: '¿Te pasa?\nSígueme', hashtags: ['#ParaTi', 'con espacio', 'fe', 'fe'], date: '2026-11-20' },
      { network: 'INSTAGRAM', text: '   ' },
      { network: 'INSTAGRAM', text: 'a'.repeat(2199), hashtags: ['largo'] },
      { network: 'INSTAGRAM', text: 'Hola', date: '2026-11-01' },
      'basura',
    ],
  }) + '\n```';
  const out = parseSuggestions(raw, '2026-11-16');
  assert.equal(out.length, 2, 'texto vacío, demasiado largo y basura se descartan');
  assert.deepEqual([out[0].network, out[0].format, out[0].date], ['TIKTOK', 'REEL', '2026-11-20'], 'TikTok siempre es video vertical');
  assert.deepEqual(out[0].hashtags, ['ParaTi', 'fe'], 'sin #, sin inválidos, sin repetidos');
  assert.equal(out[1].date, null, 'una fecha pasada no se sugiere');
  assert.deepEqual(parseSuggestions('no es json', '2026-11-16'), []);
});

test('P23: mezcla reciente y TikTok solo como borrador planificado', () => {
  assert.deepEqual(contentMix([{ network: 'INSTAGRAM', mediaType: 'IMAGE', status: 'PUBLISHED' }, { network: 'TIKTOK', mediaType: 'REEL', status: 'DRAFT' }]), { total: 2, instagram: 1, tiktok: 1, reels: 1, images: 1, published: 1 });
  const now = new Date('2026-11-16T12:00:00Z');
  const tiktok = { network: 'TIKTOK' as const, caption: 'x', hashtags: [], mediaUrl: '', mediaType: 'REEL' as const };
  assert.equal(validateForAction({ ...tiktok, action: 'draft', scheduledAt: '2026-11-20T10:00:00Z' }, now), null, 'TikTok sin cuenta se guarda con fecha');
  assert.match(validateForAction({ ...tiktok, action: 'schedule', scheduledAt: '2026-11-20T10:00:00Z' }, now)!, /cuenta de TikTok conectada/);
  assert.match(validateForAction({ caption: 'x', hashtags: [], mediaUrl: '', mediaType: 'IMAGE', action: 'draft' }, now)!, /cuenta de Instagram/);
  // P29: con cuenta conectada TikTok se programa, pero solo con video.
  const conCuenta = { ...tiktok, channelAccountId: 'tt1', scheduledAt: '2026-11-20T10:00:00Z' };
  assert.match(validateForAction({ ...conCuenta, action: 'schedule' }, now)!, /exige un video|elige un video/);
  assert.equal(validateForAction({ ...conCuenta, mediaUrl: 'https://x/v.mp4', action: 'schedule' }, now), null);
  assert.match(validateForAction({ ...conCuenta, mediaUrl: 'https://x/i.jpg', mediaType: 'IMAGE', action: 'schedule' }, now)!, /elige un video/);
});
