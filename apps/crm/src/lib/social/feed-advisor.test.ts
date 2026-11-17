import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeFeed, classifyPillar, publicationSequence, visualKind, type AdvisorPost } from './feed-advisor';
import { planAssignments } from './feed';

const now = new Date('2026-11-16T12:00:00Z');
const day = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();
const post = (id: string, caption: string, n: number, extra: Partial<AdvisorPost> = {}): AdvisorPost => ({
  id, caption, hashtags: [], mediaType: 'IMAGE', mediaUrl: 'https://x/y.jpg',
  status: n < 0 ? 'PUBLISHED' : 'SCHEDULED', publishedAt: n < 0 ? day(n) : null, scheduledAt: n < 0 ? null : day(n), ...extra,
});

test('P24: pilares y tipo visual', () => {
  assert.equal(classifyPillar({ caption: '20% de descuento solo hoy', hashtags: [] }), 'promo');
  assert.equal(classifyPillar({ caption: '3 errores al orar', hashtags: [] }), 'educativo');
  assert.equal(classifyPillar({ caption: 'Lo que nos escribió Ana', hashtags: ['testimonio'] }), 'prueba_social');
  assert.equal(classifyPillar({ caption: 'Cuéntanos cómo empiezas el día', hashtags: [] }), 'comunidad');
  assert.equal(classifyPillar({ caption: 'Cómo orar 5 minutos', hashtags: [] }), 'educativo');
  assert.equal(classifyPillar({ caption: 'Hola', hashtags: [] }), null);
  assert.equal(visualKind({ mediaType: 'REEL' }), 'video');
  assert.equal(visualKind({ mediaType: 'IMAGE', assetTags: ['Diseño'] }), 'diseño');
});

test('P24: racha de promos → reordenar propuesto (sin aplicar) que la corta', () => {
  const posts = [
    post('p1', 'Frase del día', -3), post('p2', 'Reflexión', -2),
    post('a', 'Oferta lanzamiento', 1), post('b', 'Últimos cupos, compra ya', 2), post('c', 'Precio especial', 3),
    post('d', 'Cuéntanos en comentarios', 4, { mediaType: 'REEL' }),
  ];
  const recs = analyzeFeed(posts, now);
  const streak = recs.find((r) => r.kind === 'promo_streak')!;
  assert.equal(streak.severity, 'alta');
  assert.equal(streak.action?.type, 'reorder');
  const order = (streak.action as { order: string[] }).order;
  // Aplicar el plan reparte las MISMAS fechas: la racha desaparece.
  const plan = planAssignments(order, posts.filter((p) => p.scheduledAt));
  const after = posts.map((p) => ({ ...p, scheduledAt: plan.find((x) => x.id === p.id)?.scheduledAt.toISOString() ?? p.scheduledAt }));
  assert.equal(analyzeFeed(after, now).some((r) => r.kind === 'promo_streak'), false);
  assert.deepEqual(new Set(plan.map((x) => x.scheduledAt.toISOString())), new Set(posts.filter((p) => p.scheduledAt).map((p) => p.scheduledAt)));
  assert.equal(posts[2].scheduledAt, day(1), 'analizar no modifica nada');
  assert.ok(recs.some((r) => r.kind === 'missing_educational') && recs.some((r) => r.kind === 'missing_social_proof'));
  assert.equal(recs.at(-1)!.kind, 'next_piece');
});

test('P24: alternancia, hueco sin imagen y racha solo con publicados', () => {
  const posts = [post('a', 'x', 1), post('b', 'y', 2), post('c', 'z', 3, { mediaUrl: null })];
  const recs = analyzeFeed(posts, now);
  const alt = recs.find((r) => r.kind === 'alternation')!;
  assert.equal(alt.action?.type, 'create', 'sin otra pieza distinta, propone crear un video');
  assert.equal((alt.action as { mediaType: string }).mediaType, 'REEL');
  assert.deepEqual(recs.find((r) => r.kind === 'visual_order')?.action, { type: 'edit', postId: 'c' });
  const old = [post('a', 'Oferta', -3), post('b', 'Oferta', -2), post('c', 'Oferta', -1)];
  assert.equal(analyzeFeed(old, now).some((r) => r.kind === 'promo_streak'), false, 'lo publicado no se puede mover: no se recomienda reordenarlo');
  assert.deepEqual(publicationSequence(old).map((p) => p.id), ['a', 'b', 'c']);
});
