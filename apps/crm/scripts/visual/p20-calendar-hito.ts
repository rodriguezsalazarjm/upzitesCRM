/**
 * Hito P20 (crm_pruebas, Instagram FALSO): se planifica una semana completa y
 * mover una fecha cambia la programación REAL que usa el cron.
 *  1. 7 posts programados, uno por día de la semana que viene (lunes a domingo, 9:00).
 *  2. Mover el del lunes al miércoles (lo que hace el arrastre): el cron ya no lo publica el lunes, sí el miércoles.
 *  3. Duplicar, cancelar (vuelve a borrador con su fecha) y publicar ahora desde el calendario.
 * Requiere la cuenta "QA Instagram" del hito P19. Los posts quedan para la QA en la UI.
 */
import assert from 'node:assert/strict';
import { prisma } from '../../src/lib/prisma';
import { moveToDay, weekDays } from '../../src/lib/social/calendar';
import { publishDueSocialPosts } from '../../src/lib/social/publisher';
import { saveSocialPost, socialPostAction } from '../../src/lib/social/service';

const workspaceId = (await prisma.workspace.findFirstOrThrow({ where: { name: { startsWith: 'Visual Flow A' } }, select: { id: true } })).id;
const owner = await prisma.user.findFirstOrThrow({ where: { email: 'owner-a@visual.test' }, select: { id: true } });
const account = await prisma.channelAccount.findFirstOrThrow({ where: { workspaceId, externalAccountId: 'qa-ig-p19' }, select: { id: true } });

let mediaCalls = 0;
globalThis.fetch = (async (url: string) => {
  if (!String(url).startsWith('https://graph.instagram.com/')) throw new Error(`fetch inesperado: ${url}`);
  const path = String(url).split('?')[0].replace('https://graph.instagram.com/v21.0/', '');
  if (path === 'qa-ig-p19/media') return Response.json({ id: `c${(mediaCalls += 1)}` });
  if (path.startsWith('c')) return Response.json({ status_code: 'FINISHED' });
  if (path === 'qa-ig-p19/media_publish') return Response.json({ id: `w${mediaCalls}` });
  return Response.json({ permalink: `https://www.instagram.com/p/qa-${path}/` });
}) as typeof fetch;

const nextWeek = weekDays(new Date(Date.now() + 7 * 86_400_000));
const nine = (day: Date) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0);
const names = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

// 1. Semana completa
const week = [];
for (const [i, day] of nextWeek.entries()) {
  week.push(await saveSocialPost(workspaceId, owner.id, {
    channelAccountId: account.id, caption: `Semana QA P20 · devocional del ${names[i]}`, hashtags: ['devocional'],
    mediaUrl: 'https://example.com/semana.jpg', mediaType: 'IMAGE', action: 'schedule', scheduledAt: nine(day).toISOString(),
  }));
}
assert.equal(week.length, 7);

// 2. Arrastrar lunes → miércoles (conserva la hora)
const monday = week[0];
const moved = await socialPostAction(workspaceId, monday.id, { action: 'reschedule', scheduledAt: moveToDay(monday.scheduledAt, nextWeek[2]).toISOString() });
assert.equal(moved.scheduledAt?.getTime(), nine(nextWeek[2]).getTime());
const tickMonday = await publishDueSocialPosts({ workspaceId, now: new Date(nine(nextWeek[0]).getTime() + 60_000) });
const stillScheduled = await prisma.socialPost.findFirstOrThrow({ where: { id: monday.id, workspaceId } });
assert.equal(stillScheduled.status, 'SCHEDULED', 'el lunes ya no se publica');
const tickWednesday = await publishDueSocialPosts({ workspaceId, now: new Date(nine(nextWeek[2]).getTime() + 60_000) });
const afterWednesday = await prisma.socialPost.findFirstOrThrow({ where: { id: monday.id, workspaceId } });
assert.equal(afterWednesday.status, 'PUBLISHED', 'el miércoles sí');

// Un programado no se mueve al pasado.
await assert.rejects(socialPostAction(workspaceId, week[3].id, { action: 'reschedule', scheduledAt: new Date(Date.now() - 86_400_000).toISOString() }), /ya pasó/);

// 3. Duplicar, cancelar, publicar ahora
const copy = await socialPostAction(workspaceId, week[4].id, { action: 'duplicate' }, owner.id);
assert.equal(copy.status, 'DRAFT');
assert.equal(copy.scheduledAt?.getTime(), week[4].scheduledAt?.getTime());
const canceled = await socialPostAction(workspaceId, week[5].id, { action: 'unschedule' });
assert.equal(canceled.status, 'DRAFT');
assert.equal(canceled.scheduledAt?.getTime(), week[5].scheduledAt?.getTime(), 'cancelado sigue en el calendario como borrador');
const now = await socialPostAction(workspaceId, week[6].id, { action: 'publish_now' });
assert.equal(now.status, 'PUBLISHED');

// Restaura los publicados por el cron "en el futuro" para que la QA vea la semana programada.
await prisma.socialPost.updateMany({ where: { workspaceId, status: 'PUBLISHED', publishedAt: { gt: new Date() } }, data: { status: 'SCHEDULED', publishedAt: null, permalink: null, externalPostId: null, attempts: 0 } });

console.log(JSON.stringify({
  weekPlanned: week.length,
  movedMondayToWednesday: { mondayTick: tickMonday, mondayStatus: stillScheduled.status, wednesdayTick: tickWednesday, wednesdayStatus: afterWednesday.status },
  pastRejected: true,
  duplicate: { status: copy.status, sameDate: true },
  canceled: { status: canceled.status, keepsDate: true },
  publishNow: now.status,
}, null, 2));
await prisma.$disconnect();
