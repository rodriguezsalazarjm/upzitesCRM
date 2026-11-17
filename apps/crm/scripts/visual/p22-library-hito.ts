/**
 * Hito P22 (crm_pruebas, disco local, Instagram FALSO): se sube una imagen
 * UNA vez a la biblioteca y se reutiliza en varias publicaciones y en el plan
 * del feed sin volver a subirla.
 *  - Subida en dos pasos (intención firmada → bytes → confirmación por firma de bytes).
 *  - 3 publicaciones + 1 duplicado apuntan a la MISMA pieza; Instagram recibe la misma URL.
 *  - El storage tiene un solo objeto; la pieza figura como usada en 4.
 *  - No se puede borrar mientras haya publicaciones pendientes.
 *  - Un PNG disfrazado de .jpg se rechaza y no deja archivo.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../../src/lib/prisma';
import { matchesSchedule, scheduleOrder } from '../../src/lib/social/feed';
import { createLibraryUpload, deleteLibraryAsset, finalizeLibraryUpload, storeLocalLibraryUpload } from '../../src/lib/social/library-service';
import { applyFeedPlan, saveSocialPost, socialPostAction } from '../../src/lib/social/service';

const workspaceId = (await prisma.workspace.findFirstOrThrow({ where: { name: { startsWith: 'Visual Flow A' } }, select: { id: true } })).id;
const owner = await prisma.user.findFirstOrThrow({ where: { email: 'owner-a@visual.test' }, select: { id: true } });
const account = await prisma.channelAccount.findFirstOrThrow({ where: { workspaceId, externalAccountId: 'qa-ig-p19' }, select: { id: true } });

const imageUrls: string[] = [];
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  if (!String(url).startsWith('https://graph.instagram.com/')) throw new Error(`fetch inesperado: ${url}`);
  const path = String(url).split('?')[0].replace('https://graph.instagram.com/v21.0/', '');
  if (path === 'qa-ig-p19/media') {
    imageUrls.push(new URLSearchParams(String(init?.body)).get('image_url') ?? '');
    return Response.json({ id: `lib-c${imageUrls.length}` });
  }
  if (path.startsWith('lib-c')) return Response.json({ status_code: 'FINISHED' });
  if (path === 'qa-ig-p19/media_publish') return Response.json({ id: `lib-m${imageUrls.length}` });
  return Response.json({ permalink: `https://www.instagram.com/p/qa-${path}/` });
}) as typeof fetch;

const folder = join(process.cwd(), '.media', 'content', workspaceId);
const filesInStorage = () => { try { return readdirSync(folder).length; } catch { return 0; } };
const before = filesInStorage();

// 1. Subir UNA vez
const bytes = new Uint8Array(readFileSync(join(process.cwd(), '../web/public/blog/ia-content.jpg')));
const ticket = await createLibraryUpload(workspaceId, { fileName: 'portada-5mcd.jpg', type: 'image/jpeg', size: bytes.byteLength });
await storeLocalLibraryUpload(workspaceId, ticket.intent, bytes);
const asset = await finalizeLibraryUpload(workspaceId, owner.id, { intent: ticket.intent, name: 'Portada 5MCD (QA P22)', collection: 'Lanzamiento 5MCD', tags: ['portada', 'creativo'], caption: 'Cinco minutos con Dios cada mañana.', hashtags: ['devocional', 'fe'] });
const again = await finalizeLibraryUpload(workspaceId, owner.id, { intent: ticket.intent, name: 'x', tags: [], caption: '', hashtags: [] });
assert.equal(again.id, asset.id, 'confirmar dos veces no crea dos piezas');
assert.equal(filesInStorage(), before + 1);

// 2. Reutilizar en varias publicaciones y en el plan del feed
const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(11, 0, 0, 0); return d.toISOString(); };
const common = { channelAccountId: account.id, caption: 'QA P22 · ', hashtags: ['devocional'], mediaUrl: '', mediaType: 'IMAGE' as const, contentAssetId: asset.id };
const a = await saveSocialPost(workspaceId, owner.id, { ...common, caption: 'QA P22 · programada', action: 'schedule', scheduledAt: day(30) });
const b = await saveSocialPost(workspaceId, owner.id, { ...common, caption: 'QA P22 · borrador', action: 'draft', scheduledAt: day(31) });
const c = await saveSocialPost(workspaceId, owner.id, { ...common, caption: 'QA P22 · publicada ya', action: 'publish_now' });
const d = await socialPostAction(workspaceId, a.id, { action: 'duplicate' }, owner.id);
assert.equal(c.status, 'PUBLISHED');
assert.equal(d.contentAssetId, asset.id, 'el duplicado reutiliza la pieza');
const posts = await prisma.socialPost.findMany({ where: { workspaceId, contentAssetId: asset.id } });
assert.equal(posts.length, 4);
assert.equal(new Set(posts.map((p) => p.mediaUrl)).size, 1, 'todas apuntan al mismo archivo');
assert.equal(imageUrls[0], posts[0].mediaUrl, 'Instagram recibe la URL firmada de la pieza');

const planned = posts.filter((p) => p.status !== 'PUBLISHED' && p.scheduledAt);
const order = scheduleOrder(planned).reverse();
await applyFeedPlan(workspaceId, order);
assert.equal(matchesSchedule(order, await prisma.socialPost.findMany({ where: { id: { in: order }, workspaceId } })), true, 'el planner usa la misma pieza');
assert.equal(filesInStorage(), before + 1, 'nada se volvió a subir');

// 3. Protección y validación
await assert.rejects(deleteLibraryAsset(workspaceId, asset.id), /pendiente/);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const fake = await createLibraryUpload(workspaceId, { fileName: 'falsa.jpg', type: 'image/jpeg', size: png.byteLength });
await storeLocalLibraryUpload(workspaceId, fake.intent, png);
await assert.rejects(finalizeLibraryUpload(workspaceId, owner.id, { intent: fake.intent, name: 'falsa', tags: [], caption: '', hashtags: [] }), /JPG/);
assert.equal(filesInStorage(), before + 1, 'el archivo rechazado se borra');

console.log(JSON.stringify({ uploadedOnce: true, storageObjects: filesInStorage() - before, reusedIn: posts.length, statuses: posts.map((p) => p.status).sort(), sameUrl: true, feedPlanInSync: true, deleteBlockedWhilePending: true, disguisedPngRejected: true }, null, 2));
await prisma.$disconnect();
