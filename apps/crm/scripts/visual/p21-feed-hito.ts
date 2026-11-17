/**
 * Hito P21 (crm_pruebas): 9 piezas reales (imágenes) en una cuenta "QA Feed",
 * más 3 ya publicadas. Se reordena la grilla 3×3, se guarda el plan y el orden
 * de publicación pasa a coincidir con la grilla. Lo publicado no se toca.
 * Idempotente: borra y recrea las piezas de la cuenta QA Feed en cada corrida.
 */
import assert from 'node:assert/strict';
import { prisma } from '../../src/lib/prisma';
import { encryptSecret } from '../../src/lib/crypto';
import { INSTAGRAM_OAUTH_SCOPES } from '../../src/lib/instagram/oauth';
import { matchesSchedule, scheduleOrder } from '../../src/lib/social/feed';
import { applyFeedPlan } from '../../src/lib/social/service';

const workspaceId = (await prisma.workspace.findFirstOrThrow({ where: { name: { startsWith: 'Visual Flow A' } }, select: { id: true } })).id;
const account = await prisma.channelAccount.upsert({
  where: { channel_externalAccountId: { channel: 'INSTAGRAM', externalAccountId: 'qa-ig-p21' } },
  create: { workspaceId, channel: 'INSTAGRAM', connectionMethod: 'OAUTH', externalAccountId: 'qa-ig-p21', displayName: 'QA Feed', accessTokenEncrypted: encryptSecret('qa'), scopes: INSTAGRAM_OAUTH_SCOPES.join(','), status: 'CONNECTED', connectedAt: new Date() },
  update: { workspaceId, status: 'CONNECTED' },
});
await prisma.socialPost.deleteMany({ where: { workspaceId, channelAccountId: account.id } });

const day = (offset: number, hour = 9) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, 0, 0, 0);
  return d;
};
// QA local: el servidor visual bloquea imágenes externas (CSP), así que las piezas son SVG en línea.
// En uso real la URL es https:// (la API lo exige); este script escribe directo en la base.
const COLORS = ['#1f4bff', '#c6f432', '#ff5a36', '#ffc83d', '#111111', '#7a5cff'];
const image = (seed: string) => {
  const n = [...seed].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600'><rect width='600' height='600' fill='${COLORS[n % COLORS.length]}'/><text x='300' y='350' font-size='150' font-family='Arial' font-weight='700' text-anchor='middle' fill='white'>${seed.toUpperCase()}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const published: { id: string; publishedAt: Date | null }[] = [];
for (let i = 1; i <= 3; i += 1) {
  published.push(await prisma.socialPost.create({ data: {
    workspaceId, network: 'INSTAGRAM', channelAccountId: account.id, caption: `Publicado ${i}`, mediaUrl: image(`pub${i}`),
    status: 'PUBLISHED', publishedAt: day(-i), externalPostId: `qa-pub-${i}`, history: [],
  } }));
}
const pieces: { id: string; scheduledAt: Date | null }[] = [];
for (let i = 1; i <= 9; i += 1) {
  pieces.push(await prisma.socialPost.create({ data: {
    workspaceId, network: 'INSTAGRAM', channelAccountId: account.id, caption: `Pieza ${i} · 5 minutos con Dios`, hashtags: ['devocional'],
    mediaUrl: image(`p${i}`), status: i % 3 === 0 ? 'DRAFT' : 'SCHEDULED', scheduledAt: day(9 + i), history: [],
  } }));
}

const before = scheduleOrder(pieces);
assert.deepEqual(before, pieces.map((p) => p.id).reverse(), 'arriba lo que sale último');

// Diseño: invertir la primera fila y llevar la pieza 1 al centro de la grilla.
const design = [...before];
design.splice(0, 3, before[2], before[1], before[0]);
const first = design.splice(design.indexOf(pieces[0].id), 1)[0];
design.splice(4, 0, first);
assert.equal(matchesSchedule(design, pieces), false, 'antes de guardar se advierte la diferencia');

await applyFeedPlan(workspaceId, design);
const after = await prisma.socialPost.findMany({ where: { workspaceId, id: { in: design } } });
assert.deepEqual(scheduleOrder(after), design, 'el orden real ahora es el de la grilla');
assert.equal(matchesSchedule(design, after), true);
assert.deepEqual(after.map((p) => p.scheduledAt!.getTime()).sort(), pieces.map((p) => p.scheduledAt!.getTime()).sort(), 'mismas fechas, repartidas');

await assert.rejects(applyFeedPlan(workspaceId, [published[0].id, ...design]), /no se reordena/);
const untouched = await prisma.socialPost.findMany({ where: { id: { in: published.map((p) => p.id) }, workspaceId } });
assert.ok(untouched.every((p) => p.status === 'PUBLISHED' && published.find((o) => o.id === p.id)!.publishedAt!.getTime() === p.publishedAt!.getTime()));

const publishOrder = [...after].sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime()).map((p) => p.caption.split(' ·')[0]);
console.log(JSON.stringify({ pieces: 9, published: 3, gridTopLeftToBottomRight: design.map((id) => after.find((p) => p.id === id)!.caption.split(' ·')[0]), publishOrder, publishedUntouched: true, publishedRejected: true }, null, 2));
await prisma.$disconnect();
