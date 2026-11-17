/**
 * Hito P23 (crm_pruebas, IA local determinista, sin red): desde una pieza de la
 * biblioteca se generan variantes para Instagram y TikTok, se guardan y se
 * programan sin salir de Flow.
 *  - "Variantes" devuelve una sugerencia por red; se guardan como borradores con fecha.
 *  - La de Instagram se programa (con la misma pieza); la de TikTok queda planificada
 *    en el calendario y programarla se rechaza con un motivo claro (sin conexión).
 *  - Calendario sugerido y "qué falta" devuelven sugerencias válidas con fecha futura.
 *  - Cada generación consume créditos de IA; una respuesta inválida no guarda nada.
 */
import assert from 'node:assert/strict';
import { ScriptedProvider } from '../../src/lib/agents/provider';
import { prisma } from '../../src/lib/prisma';
import { ContentAiError, generateContentSuggestions, setContentProviderForTests } from '../../src/lib/social/ai-content';
import { saveSocialPost, SocialPostError } from '../../src/lib/social/service';

const workspaceId = (await prisma.workspace.findFirstOrThrow({ where: { name: { startsWith: 'Visual Flow A' } }, select: { id: true } })).id;
const owner = await prisma.user.findFirstOrThrow({ where: { email: 'owner-a@visual.test' }, select: { id: true } });
const account = await prisma.channelAccount.findFirstOrThrow({ where: { workspaceId, externalAccountId: 'qa-ig-p19' }, select: { id: true } });
const asset = await prisma.contentAsset.findFirstOrThrow({ where: { workspaceId, name: 'Portada 5MCD (QA P22)' }, select: { id: true, caption: true } });
const usage = () => prisma.usageRecord.count({ where: { workspaceId, referenceType: 'SocialContentAI' } });
const usedBefore = await usage();

// 1. Variantes desde la pieza
const variants = await generateContentSuggestions(workspaceId, { task: 'variants', sourceText: '', contentAssetId: asset.id, tone: 'cercano' });
assert.deepEqual(variants.map((s) => s.network).sort(), ['INSTAGRAM', 'TIKTOK']);
assert.ok(variants.every((s) => s.text.includes(asset.caption)), 'parten del texto de la pieza');

// 2. Guardar ambas con la fecha planificada y programar la de Instagram
const day = new Date();
day.setDate(day.getDate() + 40);
day.setHours(11, 0, 0, 0);
const scheduledAt = day.toISOString();
const saved = [];
for (const s of variants) {
  saved.push(await saveSocialPost(workspaceId, owner.id, {
    network: s.network, channelAccountId: s.network === 'INSTAGRAM' ? account.id : undefined, caption: s.text, hashtags: s.hashtags,
    mediaUrl: '', mediaType: s.format, contentAssetId: asset.id, action: 'draft', scheduledAt,
  }));
}
const ig = saved.find((p) => p.network === 'INSTAGRAM')!;
const tt = saved.find((p) => p.network === 'TIKTOK')!;
const programmed = await saveSocialPost(workspaceId, owner.id, { network: 'INSTAGRAM', channelAccountId: account.id, caption: ig.caption, hashtags: ig.hashtags, mediaUrl: '', mediaType: 'IMAGE', contentAssetId: asset.id, action: 'schedule', scheduledAt }, ig.id);
assert.equal(programmed.status, 'SCHEDULED');
assert.deepEqual([tt.status, tt.network, tt.mediaType, tt.channelAccountId, tt.scheduledAt?.toISOString(), tt.contentAssetId], ['DRAFT', 'TIKTOK', 'IMAGE', null, scheduledAt, asset.id], 'la pieza (imagen) manda sobre el formato sugerido');
await assert.rejects(
  saveSocialPost(workspaceId, owner.id, { network: 'TIKTOK', caption: tt.caption, hashtags: tt.hashtags, mediaUrl: '', mediaType: 'REEL', contentAssetId: asset.id, action: 'schedule', scheduledAt }, tt.id),
  (e) => e instanceof SocialPostError && /TikTok todavía no/.test(e.message),
);

// 3. Calendario sugerido y qué falta
const calendar = await generateContentSuggestions(workspaceId, { task: 'calendar', sourceText: 'Cinco minutos con Dios' });
const today = new Date().toISOString().slice(0, 10);
assert.equal(calendar.length, 6);
assert.ok(calendar.every((s) => s.date && s.date > today), 'fechas futuras');
const gaps = await generateContentSuggestions(workspaceId, { task: 'gaps' });
assert.ok(gaps[0].note.length > 0);

// 4. Créditos y respuesta inválida
const usedAfter = await usage();
setContentProviderForTests(new ScriptedProvider([{ text: 'Lo siento, no puedo. {"suggestions": "nada"}' }]));
const postsBefore = await prisma.socialPost.count({ where: { workspaceId } });
await assert.rejects(generateContentSuggestions(workspaceId, { task: 'captions', sourceText: 'x' }), ContentAiError);
assert.equal(await prisma.socialPost.count({ where: { workspaceId } }), postsBefore, 'una respuesta inválida no guarda nada');
setContentProviderForTests(null);

console.log(JSON.stringify({
  variants: variants.map((s) => `${s.network}/${s.format}`),
  instagram: programmed.status,
  tiktok: `${tt.status} planificado ${tt.scheduledAt?.toISOString().slice(0, 10)}`,
  tiktokScheduleRejected: true,
  calendarDates: calendar.map((s) => s.date),
  gapNote: gaps[0].note,
  aiUsageRecords: usedAfter - usedBefore,
  invalidResponseSavesNothing: true,
}, null, 2));
await prisma.$disconnect();
