/**
 * Hito P24 (crm_pruebas): cuenta "QA Advisor" con un grid planificado
 * desbalanceado (3 promos seguidas, todo imagen, sin educativo ni prueba
 * social, una pieza sin imagen). El asistente produce recomendaciones
 * accionables SIN tocar el plan; aceptar la de las promos aplica el mismo
 * "Guardar plan" de P21 (mismas fechas, otro reparto) y la racha desaparece.
 * Idempotente: recrea las piezas de la cuenta en cada corrida.
 */
import assert from 'node:assert/strict';
import { prisma } from '../../src/lib/prisma';
import { encryptSecret } from '../../src/lib/crypto';
import { INSTAGRAM_OAUTH_SCOPES } from '../../src/lib/instagram/oauth';
import { analyzeFeed, type AdvisorPost } from '../../src/lib/social/feed-advisor';
import { applyFeedPlan } from '../../src/lib/social/service';

const workspaceId = (await prisma.workspace.findFirstOrThrow({ where: { name: { startsWith: 'Visual Flow A' } }, select: { id: true } })).id;
const account = await prisma.channelAccount.upsert({
  where: { channel_externalAccountId: { channel: 'INSTAGRAM', externalAccountId: 'qa-ig-p24' } },
  create: { workspaceId, channel: 'INSTAGRAM', connectionMethod: 'OAUTH', externalAccountId: 'qa-ig-p24', displayName: 'QA Advisor', accessTokenEncrypted: encryptSecret('qa'), scopes: INSTAGRAM_OAUTH_SCOPES.join(','), status: 'CONNECTED', connectedAt: new Date() },
  update: { workspaceId, status: 'CONNECTED' },
});
await prisma.socialPost.deleteMany({ where: { workspaceId, channelAccountId: account.id } });

const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(10, 0, 0, 0); return d; };
const COLORS = ['#1f4bff', '#c6f432', '#ff5a36', '#ffc83d', '#111111', '#7a5cff'];
const image = (n: number) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'><rect width='600' height='600' fill='${COLORS[n % COLORS.length]}'/><text x='300' y='350' font-size='150' font-family='Arial' font-weight='700' text-anchor='middle' fill='white'>${n}</text></svg>`)}`;
const PIECES: [string, number, boolean?][] = [
  ['Frase para empezar la semana', -3], ['Reflexión de la mañana', -2], ['Recuerda que no estás solo', -1],
  ['Oferta de lanzamiento: 30 experiencias guiadas', 1], ['Últimos cupos al precio de preventa', 2], ['Descuento solo por hoy', 3],
  ['Cuéntanos en comentarios cómo empiezas el día', 4], ['Frase del día', 5, true], ['Reflexión: cinco minutos bastan', 6],
];
for (const [i, [caption, offset, noMedia]] of PIECES.entries()) {
  await prisma.socialPost.create({ data: {
    workspaceId, network: 'INSTAGRAM', channelAccountId: account.id, caption, mediaUrl: noMedia ? null : image(i + 1),
    status: offset < 0 ? 'PUBLISHED' : 'SCHEDULED', publishedAt: offset < 0 ? day(offset) : null, scheduledAt: offset < 0 ? null : day(offset),
    externalPostId: offset < 0 ? `qa-p24-${i}` : null, history: [],
  } });
}

const load = () => prisma.socialPost.findMany({ where: { workspaceId, channelAccountId: account.id }, include: { contentAsset: { select: { tags: true } } } });
const toAdvisor = (rows: Awaited<ReturnType<typeof load>>): AdvisorPost[] => rows.map((p) => ({ ...p, assetTags: p.contentAsset?.tags ?? [] }));
const snapshot = (rows: Awaited<ReturnType<typeof load>>) => JSON.stringify(rows.map((p) => [p.id, p.scheduledAt?.toISOString(), p.updatedAt.toISOString()]).sort());

// 1. Analizar: recomendaciones accionables y el plan intacto
const before = await load();
const recs = analyzeFeed(toAdvisor(before));
const kinds = recs.map((r) => r.kind);
for (const kind of ['promo_streak', 'missing_educational', 'missing_social_proof', 'alternation', 'visual_order', 'next_piece'] as const) assert.ok(kinds.includes(kind), `falta ${kind}`);
assert.ok(recs.every((r) => r.kind === 'pillar_balance' || r.action), 'cada recomendación trae una acción');
assert.equal(snapshot(await load()), snapshot(before), 'analizar no modifica el plan');

// Con --solo-analizar deja el grid sin aceptar nada (para la QA en la UI).
if (process.argv.includes('--solo-analizar')) {
  console.log(JSON.stringify({ recommendations: recs.map((r) => `${r.severity} · ${r.kind}`), planUntouchedByAnalysis: true }, null, 2));
  await prisma.$disconnect();
  process.exit(0);
}

// 2. Ignorar = nada cambia. Aceptar la de promos = mismo guardado de P21.
const streak = recs.find((r) => r.kind === 'promo_streak')!;
assert.equal(streak.action?.type, 'reorder');
await applyFeedPlan(workspaceId, (streak.action as { order: string[] }).order);
const after = await load();
const dates = (rows: typeof after) => rows.map((p) => p.scheduledAt?.toISOString()).filter(Boolean).sort();
assert.deepEqual(dates(after), dates(before), 'se reparten las mismas fechas');
assert.equal(after.filter((p) => p.status === 'PUBLISHED').map((p) => p.publishedAt?.toISOString()).sort().join(), before.filter((p) => p.status === 'PUBLISHED').map((p) => p.publishedAt?.toISOString()).sort().join(), 'lo publicado no se toca');
const recsAfter = analyzeFeed(toAdvisor(after));
assert.equal(recsAfter.some((r) => r.kind === 'promo_streak'), false, 'la racha de promos desaparece');

console.log(JSON.stringify({
  recommendations: recs.map((r) => `${r.severity} · ${r.kind} · ${r.action?.type ?? '—'}`),
  planUntouchedByAnalysis: true,
  acceptedPromoReorder: true,
  sameDates: true,
  promoStreakAfter: false,
  remaining: recsAfter.map((r) => r.kind),
}, null, 2));
await prisma.$disconnect();
