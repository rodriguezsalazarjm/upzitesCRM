/**
 * P29 — verificar el hito de TikTok REAL: cuenta conectada por Login Kit y un
 * video de prueba programado/publicado desde /social con estado confirmado.
 *
 * Comprueba, sin mocks:
 *  1. cuenta TikTok conectada por OAuth (no la "QA TikTok" del hito local), CONNECTED;
 *  2. TikTok concedió todos los scopes;
 *  3. API real: /user/info devuelve esta misma cuenta;
 *  4. hay un video publicado desde Flow (SocialPost TIKTOK PUBLISHED, programado o publicar ahora);
 *  5. TikTok confirma el estado: PUBLISH_COMPLETE (privado) o el video existe en /video/query (público).
 * Solo lectura: no refresca el token (si venció, abre /integraciones y pulsa "Verificar ahora").
 *
 * Uso (desde apps/crm, con las variables del servidor que publicó):
 *   PRELOAD_ALLOW_HOST=open.tiktokapis.com NODE_OPTIONS="--require ./scripts/visual/p27-preload.cjs" \
 *     node node_modules/tsx/dist/cli.mjs scripts/visual/p29-tiktok-verify.ts --cuenta "<nombre visible>"
 */
import { decryptSecret } from '../../src/lib/crypto';
import { prisma } from '../../src/lib/prisma';
import { missingTikTokScopes, tiktokApi } from '../../src/lib/tiktok/oauth';

const i = process.argv.indexOf('--cuenta');
const name = i > 0 ? process.argv[i + 1] : undefined;
if (!name) {
  console.log('Falta --cuenta "<nombre visible de la cuenta TikTok conectada>".');
  process.exit(1);
}
const results: [boolean, string][] = [];
const check = (ok: boolean, label: string) => results.push([ok, label]);

const account = await prisma.channelAccount.findFirst({
  where: { channel: 'TIKTOK', connectionMethod: 'OAUTH', displayName: name, externalAccountId: { not: 'qa-tt-p29' } },
  orderBy: { connectedAt: 'desc' },
});
if (!account) {
  console.log(`No hay una cuenta TikTok "${name}" conectada por OAuth en esta base. Conéctala desde /integraciones.`);
  await prisma.$disconnect();
  process.exit(1);
}
check(account.status === 'CONNECTED', `1. cuenta conectada por OAuth (estado ${account.status}${account.lastError ? `: ${account.lastError}` : ''})`);
const missing = missingTikTokScopes(account.scopes);
check(missing.length === 0, `2. scopes concedidos${missing.length ? ` (faltan: ${missing.join(', ')})` : ''}`);

const expired = !account.accessTokenExpiresAt || account.accessTokenExpiresAt.getTime() < Date.now();
const token = account.accessTokenEncrypted && !expired ? decryptSecret(account.accessTokenEncrypted) : null;
if (!token) console.log('    token vencido o ausente: pulsa "Verificar ahora" en /integraciones (lo refresca) y vuelve a correr.');
const me = token ? await tiktokApi<{ user?: { open_id?: string } }>('/user/info/?fields=open_id,display_name', token) : null;
check(me?.ok === true && me.data?.user?.open_id === account.externalAccountId, `3. API real: /user/info es esta cuenta (${me ? me.code : 'sin token'})`);

const post = await prisma.socialPost.findFirst({ where: { channelAccountId: account.id, network: 'TIKTOK', status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' } });
const history = (post?.history as { event: string }[] | undefined)?.map((h) => h.event) ?? [];
check(Boolean(post?.externalPostId) && (history.includes('scheduled') || history.includes('publish_requested')), `4. video publicado desde Flow (${post ? `${post.publishedAt?.toISOString()} · ${history.join(' → ')}` : 'ninguno'})`);

let confirmed = false;
if (token && post?.externalPostId) {
  if (post.externalPostId.startsWith('publish:')) {
    const status = await tiktokApi<{ status?: string }>('/post/publish/status/fetch/', token, { body: { publish_id: post.externalPostId.slice('publish:'.length) } });
    confirmed = status.ok && status.data?.status === 'PUBLISH_COMPLETE';
    console.log(`    TikTok status/fetch: ${status.code} · ${status.data?.status ?? '—'} (privado)`);
  } else {
    const video = await tiktokApi<{ videos?: Array<{ id?: string; share_url?: string }> }>('/video/query/?fields=id,share_url', token, { body: { filters: { video_ids: [post.externalPostId] } } });
    confirmed = video.ok && video.data?.videos?.[0]?.id === post.externalPostId;
    console.log(`    TikTok video/query: ${video.code} · ${video.data?.videos?.[0]?.share_url ?? '—'} (público)`);
  }
}
check(confirmed, '5. TikTok confirma el estado del video');

for (const [ok, label] of results) console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}`);
console.log(results.every(([ok]) => ok) ? '\nHITO P29 CUMPLIDO' : '\nHito P29 incompleto');
await prisma.$disconnect();
process.exit(results.every(([ok]) => ok) ? 0 : 1);
