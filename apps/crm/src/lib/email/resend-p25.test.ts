import assert from 'node:assert/strict';
import test from 'node:test';
import { emailReadiness } from '../platform/transactional-email';
import { createResendProvider, domainResult } from './resend';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('P25: re-verificar un dominio ya creado no lo vuelve a crear', async () => {
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${String(url).replace('https://api.resend.com', '')}`);
    if (String(url).endsWith('/verify')) return json(200, { object: 'domain', id: 'd_1' });
    return json(200, { id: 'd_1', name: 'mail.x.cl', status: 'verified', records: [{ type: 'MX', name: 'send', value: 'feedback-smtp.resend.com', priority: 10 }] });
  }) as typeof fetch;
  try {
    const result = await createResendProvider('re_test').verifyDomain('mail.x.cl', 'd_1');
    assert.equal(result.status, 'VERIFIED');
    assert.deepEqual(calls, ['POST /domains/d_1/verify', 'GET /domains/d_1']);
    assert.deepEqual(result.dnsRecords, [{ type: 'MX', name: 'send', value: 'feedback-smtp.resend.com', priority: 10 }]);

    // Sin id guardado y Resend dice "ya existe": se busca en la lista en vez de fallar.
    calls.length = 0;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const path = String(url).replace('https://api.resend.com', '');
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      if (init?.method === 'POST' && path === '/domains') return json(422, { message: 'Domain already registered' });
      if (path === '/domains') return json(200, { data: [{ id: 'd_9', name: 'mail.x.cl' }] });
      if (path.endsWith('/verify')) return json(200, {});
      return json(200, { id: 'd_9', status: 'pending', records: [] });
    }) as typeof fetch;
    const again = await createResendProvider('re_test').verifyDomain('mail.x.cl');
    assert.equal(again.status, 'PENDING');
    assert.equal(again.providerDomainId, 'd_9');
    assert.deepEqual(calls, ['POST /domains', 'GET /domains', 'POST /domains/d_9/verify', 'GET /domains/d_9']);
  } finally {
    globalThis.fetch = original;
  }
});

test('P25: estados de dominio y eventos de Resend', () => {
  assert.equal(domainResult({ status: 'temporary_failure' }).status, 'PENDING');
  assert.equal(domainResult({ status: 'not_started' }).status, 'PENDING');
  assert.equal(domainResult({ status: 'failed' }).status, 'FAILED');
  const provider = createResendProvider('re_test');
  const event = (type: string) => JSON.stringify({ type, created_at: '2026-11-20T12:00:00Z', data: { email_id: 'em_1', to: ['a@b.cl'] } });
  assert.deepEqual(provider.parseEvents(event('email.delivery_delayed')), [], 'un retraso no marca el mensaje como fallido');
  assert.equal(provider.parseEvents(event('email.failed'))[0]?.type, 'FAILED');
  assert.equal(provider.parseEvents(event('email.delivered'))[0]?.type, 'DELIVERED');
});

test('P25: readiness muestra presencia, nunca valores', () => {
  const none = emailReadiness({});
  assert.ok(none.every((c) => !c.ok));
  const ok = emailReadiness({ RESEND_API_KEY: 're_x', PLATFORM_EMAIL_FROM: 'Upzites <no-reply@mail.upzites.com>', EMAIL_PROVIDER: 'resend', EMAIL_WEBHOOK_SECRET: 'whsec_abc' });
  assert.ok(ok.every((c) => c.ok));
  assert.ok(!JSON.stringify(ok).includes('re_x'));
  assert.equal(emailReadiness({ PLATFORM_EMAIL_FROM: 'Upzites' }).find((c) => c.key === 'PLATFORM_EMAIL_FROM')?.ok, false);
});
