import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGmailMessage } from './gmail';
import { buildMime, encodeHeader, htmlToText, parseAddress, parseAddressList } from './mime';
import { createMailOAuthState, verifyMailOAuthState } from './oauth-state';

process.env.CRM_SESSION_SECRET ??= 'test-secret-de-sesion-largo';

test('P38: MIME con tildes, adjunto e hilo; sin inyección de encabezados', () => {
  const raw = buildMime({
    from: 'yo@negocio.cl', to: ['ana@cliente.cl'], cc: [], subject: 'Cotización\r\nBcc: espía@x.cl', text: 'Hola Ana, ¿cómo estás?',
    attachments: [{ filename: 'COT-2026-0001.pdf', mimeType: 'application/pdf', content: new Uint8Array([37, 80, 68, 70]) }],
    inReplyTo: '<abc@mail.gmail.com>', references: '<prev@x>', threadId: null,
  });
  const head = raw.split('\r\n\r\n')[0];
  assert.ok(!/^Bcc:/m.test(raw), 'un salto de línea en el asunto no crea encabezados');
  assert.match(head, /^Subject: =\?UTF-8\?B\?/m);
  assert.equal(Buffer.from(head.match(/=\?UTF-8\?B\?([^?]+)\?=/)![1], 'base64').toString(), 'Cotización Bcc: espía@x.cl');
  assert.match(head, /^In-Reply-To: <abc@mail\.gmail\.com>$/m);
  assert.match(head, /^References: <prev@x> <abc@mail\.gmail\.com>$/m);
  assert.match(raw, /filename="COT-2026-0001\.pdf"/);
  assert.ok(raw.includes(Buffer.from('%PDF').toString('base64')));
  const plain = buildMime({ from: 'a@b.cl', to: ['c@d.cl'], cc: [], subject: 'Hola', text: 'ñ', attachments: [], inReplyTo: null, references: null, threadId: null });
  assert.match(plain, /Content-Type: text\/plain; charset="UTF-8"/);
  assert.ok(!plain.includes('multipart'));
  assert.equal(encodeHeader('Plain'), 'Plain');
});

test('P38: HTML a texto y direcciones', () => {
  assert.equal(htmlToText('<style>x{}</style><p>Hola&nbsp;<b>Ana</b></p><script>alert(1)</script><p>Chao &amp; gracias</p>'), 'Hola Ana\nChao & gracias');
  assert.deepEqual(parseAddress('"Pérez, Ana" <Ana@Cliente.cl>'), { name: 'Pérez, Ana', address: 'ana@cliente.cl' });
  assert.deepEqual(parseAddressList('"Pérez, Ana" <ana@x.cl>, bob@y.cl, nada'), ['ana@x.cl', 'bob@y.cl']);
});

test('P38: mensaje de Gmail normalizado (texto, adjuntos, etiquetas)', () => {
  const b64 = (s: string) => Buffer.from(s).toString('base64url');
  const parsed = parseGmailMessage({
    id: 'm1', threadId: 't1', labelIds: ['INBOX', 'UNREAD'], internalDate: '1763380000000',
    payload: {
      mimeType: 'multipart/mixed', headers: [{ name: 'From', value: 'Ana <ana@cliente.cl>' }, { name: 'To', value: 'yo@negocio.cl' }, { name: 'Subject', value: 'Re: Cotización' }, { name: 'Message-ID', value: '<x@y>' }],
      parts: [
        { mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/html', body: { data: b64('<p>Acepto</p>') } }] },
        { mimeType: 'application/pdf', filename: 'firmada.pdf', body: { attachmentId: 'att-1', size: 2048 } },
      ],
    },
  }, 'yo@negocio.cl');
  assert.equal(parsed.bodyText, 'Acepto');
  assert.equal(parsed.unread, true);
  assert.equal(parsed.inInbox, true);
  assert.equal(parsed.outbound, false);
  assert.deepEqual(parsed.attachments, [{ id: 'att-1', filename: 'firmada.pdf', mimeType: 'application/pdf', size: 2048 }]);
  assert.equal(parsed.internetMessageId, '<x@y>');
});

test('P38: state OAuth firmado, por proveedor y con vencimiento', () => {
  const { state, nonce } = createMailOAuthState({ workspaceId: 'w', userId: 'u', provider: 'GMAIL' });
  assert.equal(verifyMailOAuthState(state, 'GMAIL')?.nonce, nonce);
  assert.equal(verifyMailOAuthState(state, 'MICROSOFT'), null, 'un state de Gmail no sirve para Microsoft');
  assert.equal(verifyMailOAuthState(`${state.split('.')[0]}x.${state.split('.')[1]}`, 'GMAIL'), null, 'alterado');
  assert.equal(verifyMailOAuthState(state, 'GMAIL', Date.now() + 11 * 60_000), null, 'vencido');
});
