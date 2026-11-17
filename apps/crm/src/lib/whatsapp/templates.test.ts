import assert from 'node:assert/strict';
import test from 'node:test';
import { sendTemplateMessage } from './client';
import { dedupeKeyFor, normalizeWebhookPayload } from './normalize';
import { mapMetaStatus, placeholderCount, renderTemplate, templateUnusableReason, toMetaBody } from './template-rules';

const approved = { name: 'recordatorio', status: 'APPROVED' as const, channelId: 'ch_1', body: 'Hola {{1}}, tu {{2}} te espera.', variables: ['nombre', 'producto'] };

test('P26: variables con nombre → numeradas para Meta, y de vuelta', () => {
  const meta = toMetaBody('Hola {{nombre}}, tu {{producto}} te espera, {{nombre}}.');
  assert.equal(meta.body, 'Hola {{1}}, tu {{2}} te espera, {{1}}.');
  assert.deepEqual(meta.variables, ['nombre', 'producto']);
  assert.deepEqual(toMetaBody('{{precio}}').unknown, ['precio']);
  assert.equal(placeholderCount('a {{1}} b {{3}}') instanceof Object, true, 'saltar {{2}} es un error');
  assert.equal(placeholderCount('sin variables'), 0);

  const ok = renderTemplate(approved, { nombre: 'Ana', producto: 'Malla 3x3' });
  assert.deepEqual(ok, { ok: true, text: 'Hola Ana, tu Malla 3x3 te espera.', params: ['Ana', 'Malla 3x3'] });
  const missing = renderTemplate(approved, { nombre: 'Ana' });
  assert.equal(missing.ok, false, 'un dato vacio no sale como "Hola Ana, tu  te espera"');
});

test('P26: fallback — solo sirve una plantilla aprobada, del mismo numero y con variables asignadas', () => {
  assert.equal(templateUnusableReason(approved, 'ch_1'), null);
  assert.match(templateUnusableReason({ ...approved, status: 'PENDING' }, 'ch_1') ?? '', /no está aprobada por Meta \(En revisión\)/);
  assert.match(templateUnusableReason({ ...approved, status: 'PAUSED' }, 'ch_1') ?? '', /\(Pausada por Meta\)/);
  assert.match(templateUnusableReason(approved, 'ch_2') ?? '', /otro número/);
  assert.match(templateUnusableReason({ ...approved, variables: ['nombre'] }, 'ch_1') ?? '', /sin asignar/);
  assert.equal(mapMetaStatus('REINSTATED'), 'APPROVED');
  assert.equal(mapMetaStatus('PENDING_DELETION'), 'DISABLED');
  assert.equal(mapMetaStatus('IN_APPEAL'), 'PENDING');
});

test('P26: webhook message_template_status_update se normaliza con la WABA y deduplica', () => {
  const body = {
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba_9', changes: [{ field: 'message_template_status_update', value: { event: 'APPROVED', message_template_id: 12345, message_template_name: 'recordatorio', message_template_language: 'es', reason: 'NONE' } }] }],
  };
  const events = normalizeWebhookPayload(body);
  assert.deepEqual(events, [{ kind: 'template_status', wabaId: 'waba_9', externalId: '12345', event: 'APPROVED', reason: 'NONE' }]);
  assert.equal(dedupeKeyFor(events, ''), 't:12345:APPROVED');
});

test('P26: envio de plantilla — forma del request y errores claros', async () => {
  const original = globalThis.fetch;
  let sent: Record<string, unknown> = {};
  process.env.WHATSAPP_SYSTEM_ACCESS_TOKEN = 'test-token';
  try {
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 });
    }) as typeof fetch;
    const ok = await sendTemplateMessage({ channel: { phoneNumberId: 'p1', accessTokenEncrypted: null }, to: '+56911112222', template: { name: 'recordatorio', language: 'es', params: ['Ana'] } });
    assert.deepEqual(ok, { ok: true, externalMessageId: 'wamid.1' });
    assert.deepEqual(sent, {
      messaging_product: 'whatsapp', recipient_type: 'individual', to: '56911112222', type: 'template',
      template: { name: 'recordatorio', language: { code: 'es' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }] }] },
    });

    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { code: 132001, message: 'Template name does not exist in the translation' } }), { status: 404 })) as typeof fetch;
    const failed = await sendTemplateMessage({ channel: { phoneNumberId: 'p1', accessTokenEncrypted: null }, to: '56911112222', template: { name: 'x', language: 'es', params: [] } });
    assert.equal(failed.ok, false);
    assert.match(failed.ok ? '' : failed.errorMessage, /no encuentra la plantilla/);
    assert.equal(failed.ok ? true : failed.retryable, false);
  } finally {
    globalThis.fetch = original;
    delete process.env.WHATSAPP_SYSTEM_ACCESS_TOKEN;
  }
});
