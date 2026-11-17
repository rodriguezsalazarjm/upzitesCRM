/**
 * Hito P25 (crm_pruebas, Resend SIMULADO: nada sale a internet).
 * Email de plataforma (prueba, reset de contraseña) queda registrado sin cuerpo →
 * el webhook real (/api/webhooks/email) con firma Svix lo marca entregado →
 * reintento del proveedor sin efecto → retraso no lo degrada → rebote lo marca →
 * firma falsa rechazada → error del proveedor queda FAILED con el motivo.
 * Lo que este hito NO prueba: que Resend real entregue desde un dominio verificado.
 * Idempotente: borra lo que crea.
 */
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { prisma } from '../../src/lib/prisma';
import { sendPasswordResetEmail } from '../../src/lib/password-reset';
import { sendPlatformEmail, type PlatformEmailSender } from '../../src/lib/platform/transactional-email';
import { POST as webhook } from '../../src/app/api/webhooks/email/route';

const ok = (label: string) => console.log(`OK  ${label}`);
const secretBytes = randomBytes(24);
process.env.EMAIL_PROVIDER = 'RESEND';
process.env.RESEND_API_KEY = 're_hito_p25_no_real';
process.env.EMAIL_WEBHOOK_SECRET = `whsec_${secretBytes.toString('base64')}`;

const run = randomBytes(4).toString('hex');
const ids: string[] = [];
const sender: PlatformEmailSender = async (input) => {
  const id = `p25-${run}-${ids.length}`;
  ids.push(id);
  assert.ok(input.from.includes('@'), 'remitente de plataforma');
  return { ok: true, providerMessageId: id };
};

function signed(body: object, secret = secretBytes) {
  const raw = JSON.stringify(body);
  const id = `msg_${randomBytes(6).toString('hex')}`;
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac('sha256', secret).update(`${id}.${ts}.${raw}`).digest('base64');
  return new Request('http://localhost/api/webhooks/email', { method: 'POST', body: raw, headers: { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` } });
}
const event = (type: string, emailId: string, at: string, extra: object = {}) => ({ type, created_at: at, data: { email_id: emailId, to: ['owner-a@visual.test'], ...extra } });
const row = (providerMessageId: string) => prisma.platformEmailMessage.findUniqueOrThrow({ where: { providerMessageId } });

try {
  // 1. Prueba de plataforma: fila SENT, sin cuerpo.
  const test = await sendPlatformEmail({ kind: 'TEST', to: 'Owner-A@visual.test', subject: `Prueba P25 ${run}`, text: 't', html: '<p>t</p>' }, sender);
  assert.ok(test.sent);
  const testId = ids[0];
  let r = await row(testId);
  assert.equal(r.status, 'SENT');
  assert.equal(r.toEmail, 'owner-a@visual.test');
  ok('1. email de plataforma registrado (SENT, destinatario normalizado)');

  // 2. Reset de contraseña: el token NO queda en la base.
  const token = randomBytes(16).toString('base64url');
  await sendPasswordResetEmail({ userId: 'x', email: 'owner-a@visual.test', name: 'Ana', token, url: `http://localhost/restablecer/${token}`, expiresAt: new Date(Date.now() + 3600_000) }, sender);
  const reset = await row(ids[1]);
  assert.equal(reset.kind, 'PASSWORD_RESET');
  assert.ok(!JSON.stringify(reset).includes(token), 'el enlace de un solo uso no se guarda');
  ok('2. reset de contraseña registrado sin el token');

  // 3. Webhook firmado: entregado.
  let res = await webhook(signed(event('email.delivered', testId, '2026-11-20T12:00:00Z')));
  assert.equal(res.status, 200);
  r = await row(testId);
  assert.equal(r.status, 'DELIVERED');
  assert.ok(r.deliveredAt);
  ok('3. webhook Svix → DELIVERED con fecha');

  // 4. Reintento del proveedor: sin efecto.
  res = await webhook(signed(event('email.delivered', testId, '2026-11-20T12:00:00Z')));
  assert.equal(((await res.json()) as { data: { duplicates: number } }).data.duplicates, 1);
  ok('4. reintento del mismo evento → duplicado, sin cambios');

  // 5. Retraso tardío: ignorado (antes lo dejaba FAILED).
  res = await webhook(signed(event('email.delivery_delayed', testId, '2026-11-20T12:01:00Z')));
  assert.equal(((await res.json()) as { data: { ignored?: boolean } }).data.ignored, true);
  assert.equal((await row(testId)).status, 'DELIVERED');
  ok('5. delivery_delayed no degrada el estado');

  // 6. Rebote del reset.
  await webhook(signed(event('email.bounced', ids[1], '2026-11-20T12:02:00Z', { bounce: { type: 'Permanent' } })));
  const bounced = await row(ids[1]);
  assert.equal(bounced.status, 'BOUNCED');
  assert.ok(bounced.bouncedAt);
  ok('6. rebote → BOUNCED');

  // 7. Firma falsa y evento desconocido.
  res = await webhook(signed(event('email.delivered', ids[1], '2026-11-20T12:03:00Z'), randomBytes(24)));
  assert.equal(res.status, 401);
  res = await webhook(signed(event('email.delivered', `nadie-${run}`, '2026-11-20T12:03:00Z')));
  assert.equal(((await res.json()) as { data: { unknown: number } }).data.unknown, 1);
  ok('7. firma falsa → 401; mensaje ajeno → desconocido, 200');

  // 8. Proveedor rechaza: queda FAILED con el motivo.
  const failed = await sendPlatformEmail({ kind: 'INVITATION', to: 'x@visual.test', subject: `Invitación P25 ${run}`, text: 't', html: 't' }, async () => ({ ok: false, error: 'The domain is not verified', retryable: false }));
  assert.equal(failed.sent, false);
  const failedRow = await prisma.platformEmailMessage.findFirstOrThrow({ where: { subject: `Invitación P25 ${run}` } });
  assert.equal(failedRow.status, 'FAILED');
  assert.match(failedRow.lastError ?? '', /not verified/);
  ok('8. rechazo del proveedor → FAILED con motivo visible en /platform/email');
} finally {
  await prisma.platformEmailMessage.deleteMany({ where: { OR: [{ providerMessageId: { in: ids } }, { subject: { endsWith: ` P25 ${run}` } }] } });
  await prisma.$disconnect();
}
console.log('Hito P25 local: 8/8. Falta el envío real por Resend (ver /platform/email).');
