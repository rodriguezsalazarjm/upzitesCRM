/**
 * P28 — verificar el hito de Instagram REAL despues de la prueba manual:
 * desde otra cuenta de Instagram se manda un DM y se comenta un post de la
 * cuenta conectada; una automatizacion publicada (p. ej. palabra clave o
 * comentario → DM) debe responder.
 *
 * Comprueba, sin mocks:
 *  1. cuenta Instagram conectada por OAuth (no fake), CONNECTED;
 *  2. Meta concedio todos los scopes requeridos;
 *  3. API real: el token responde /me y subscribed_apps tiene messages + comments;
 *  4. llego un DM real por webhook y se proceso (tiene conversacion);
 *  5. llego un comentario real por webhook y se proceso;
 *  6. ambos aparecen en Flow como mensajes entrantes;
 *  7. una automatizacion (regla o flujo) se completo despues del evento;
 *  8. hay una respuesta saliente aceptada por Meta (SENT/DELIVERED/READ con id externo).
 * Solo lectura: no refresca el token ni cambia el estado de la cuenta. No imprime secretos.
 *
 * Uso (desde apps/crm, con las variables del servidor que recibio el webhook):
 *   PRELOAD_ALLOW_HOST=graph.instagram.com NODE_OPTIONS="--require ./scripts/visual/p27-preload.cjs" \
 *     node node_modules/tsx/dist/cli.mjs scripts/visual/p28-ig-verify.ts --cuenta <username> [--desde 2026-11-19T10:00]
 */
import { decryptSecret } from '../../src/lib/crypto';
import { getInstagramSubscribedFields } from '../../src/lib/instagram/webhook-subscription';
import { missingInstagramScopes } from '../../src/lib/instagram/oauth';
import { prisma } from '../../src/lib/prisma';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const since = new Date(arg('--desde') ?? Date.now() - 24 * 60 * 60_000);
const username = arg('--cuenta');
// Obligatorio: crm_pruebas tiene cuentas QA "OAUTH" con tokens falsos que no deben tomarse por la real.
if (!username) {
  console.log('Falta --cuenta <username de Instagram conectado>.');
  process.exit(1);
}
const results: [boolean, string][] = [];
const check = (ok: boolean, label: string) => results.push([ok, label]);

const account = (
  await prisma.channelAccount.findMany({
    where: { channel: 'INSTAGRAM', connectionMethod: 'OAUTH', displayName: username },
    orderBy: { connectedAt: 'desc' },
  })
).find((a) => !(a.metadata as { fake?: boolean } | null)?.fake);
if (!account) {
  console.log('No hay una cuenta de Instagram real conectada por OAuth en esta base. Conéctala desde /integraciones.');
  await prisma.$disconnect();
  process.exit(1);
}
console.log(`Cuenta @${account.displayName ?? account.externalAccountId} · eventos desde ${since.toISOString()}`);
check(account.status === 'CONNECTED', `1. cuenta conectada por OAuth (estado ${account.status}${account.lastError ? `: ${account.lastError}` : ''})`);
const missing = missingInstagramScopes(account.scopes);
check(missing.length === 0, `2. scopes concedidos${missing.length ? ` (faltan: ${missing.join(', ')})` : ''}`);

const token = account.accessTokenEncrypted ? { ok: true as const, accessToken: decryptSecret(account.accessTokenEncrypted) } : { ok: false as const, reason: 'sin token guardado' };
let liveOk = false;
if (token.ok) {
  const me = await fetch(`https://graph.instagram.com/v21.0/me?${new URLSearchParams({ fields: 'user_id', access_token: token.accessToken })}`);
  const body = (await me.json().catch(() => ({}))) as { user_id?: string };
  const fields = me.ok ? await getInstagramSubscribedFields({ instagramAccountId: account.externalAccountId, accessToken: token.accessToken }).catch(() => []) : [];
  liveOk = body.user_id === account.externalAccountId && fields.includes('messages') && fields.includes('comments');
  console.log(`    Meta: /me http ${me.status} · id coincide ${body.user_id === account.externalAccountId} · subscribed_fields ${fields.join(',') || '—'}`);
} else console.log(`    token: ${token.reason}`);
check(liveOk, '3. API real: token válido y subscribed_apps con messages + comments');

const event = (type: 'DM_RECEIVED' | 'COMMENT') =>
  prisma.channelEvent.findFirst({ where: { channelAccountId: account.id, type, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } });
const [dm, comment] = await Promise.all([event('DM_RECEIVED'), event('COMMENT')]);
check(dm?.status === 'PROCESSED' && Boolean(dm.conversationId), `4. DM real recibido y procesado (${dm ? `${dm.status}${dm.error ? `: ${dm.error}` : ''}` : 'no llegó'})`);
check(comment?.status === 'PROCESSED' && Boolean(comment.conversationId), `5. comentario real recibido y procesado (${comment ? `${comment.status}${comment.error ? `: ${comment.error}` : ''}` : 'no llegó'})`);

const conversationIds = [dm?.conversationId, comment?.conversationId].filter((id): id is string => Boolean(id));
const inbound = await prisma.message.count({ where: { conversationId: { in: conversationIds }, direction: 'INBOUND', createdAt: { gte: since } } });
check(conversationIds.length === 2 && inbound >= 2, `6. ambos aparecen en Flow (${inbound} mensaje(s) entrante(s) en ${conversationIds.length} conversación(es))`);

const firstEventAt = [dm?.createdAt, comment?.createdAt].filter((d): d is Date => Boolean(d)).sort((a, b) => a.getTime() - b.getTime())[0] ?? since;
const contactIds = [dm?.contactId, comment?.contactId].filter((id): id is string => Boolean(id));
const [rules, flows] = await Promise.all([
  prisma.automationExecution.count({ where: { workspaceId: account.workspaceId, contactId: { in: contactIds }, status: 'COMPLETED', createdAt: { gte: firstEventAt } } }),
  prisma.automationFlowRun.count({ where: { workspaceId: account.workspaceId, channel: 'INSTAGRAM', contactId: { in: contactIds }, status: { in: ['COMPLETED', 'WAITING'] }, startedAt: { gte: firstEventAt } } }),
]);
check(rules + flows > 0, `7. automatización disparada y completada (${rules} regla(s), ${flows} flujo(s))`);

const replies = await prisma.message.findMany({
  where: { conversation: { channelAccountId: account.id }, direction: 'OUTBOUND', createdAt: { gte: firstEventAt } },
  select: { status: true, externalMessageId: true, errorMessage: true },
});
const accepted = replies.filter((m) => ['SENT', 'DELIVERED', 'READ'].includes(m.status) && m.externalMessageId);
const failed = replies.filter((m) => m.status === 'FAILED');
check(accepted.length > 0, `8. respuesta aceptada por Meta (${accepted.length} enviada(s)${failed.length ? `, ${failed.length} fallida(s): ${failed[0].errorMessage ?? '—'}` : ''})`);

for (const [ok, label] of results) console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}`);
console.log(results.every(([ok]) => ok) ? '\nHITO P28 CUMPLIDO' : '\nHito P28 incompleto');
await prisma.$disconnect();
process.exit(results.every(([ok]) => ok) ? 0 : 1);
