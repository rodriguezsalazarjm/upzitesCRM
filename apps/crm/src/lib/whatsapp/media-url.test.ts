import assert from 'node:assert/strict';
import test from 'node:test';
import { assertMetaMediaUrl, isAllowedMediaHost } from './media-url';
import { normalizeWebhookPayload } from './normalize';

/**
 * La descarga de medios lleva el token de WhatsApp en la cabecera y la
 * direccion la propone el proveedor. Estas pruebas cubren el unico punto donde
 * eso se puede detener.
 */

test('acepta los destinos reales de descarga de WhatsApp', () => {
  const validas = [
    'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=123',
    'https://scontent.xx.fbcdn.net/v/t62/archivo.jpg',
    'https://graph.facebook.com/v26.0/123456',
  ];

  for (const url of validas) {
    assert.doesNotThrow(() => assertMetaMediaUrl(url), url);
  }
});

test('rechaza cualquier host ajeno, que es como se llega a la red interna', () => {
  const invalidas = [
    'https://169.254.169.254/latest/meta-data/',
    'https://localhost/admin',
    'https://10.0.0.5/interno',
    'https://evil.com/archivo.jpg',
    // El host real es `atacante.com`: lo de la izquierda es el nombre de usuario.
    'https://lookaside.fbsbx.com@atacante.com/archivo.jpg',
    // Sufijo parecido, dominio distinto.
    'https://notfbcdn.net/archivo.jpg',
    'https://fbcdn.net.atacante.com/archivo.jpg',
  ];

  for (const url of invalidas) {
    assert.throws(() => assertMetaMediaUrl(url), url);
  }
});

test('exige HTTPS: un salto a texto plano expondria el token', () => {
  assert.throws(() => assertMetaMediaUrl('http://lookaside.fbsbx.com/archivo.jpg'));
  assert.throws(() => assertMetaMediaUrl('file:///etc/passwd'));
  assert.throws(() => assertMetaMediaUrl('no-es-una-url'));
});

test('la comparacion de host no depende de mayusculas ni del punto final', () => {
  assert.equal(isAllowedMediaHost('LOOKASIDE.FBSBX.COM'), true);
  assert.equal(isAllowedMediaHost('scontent.XX.fbcdn.net.'), true);
  assert.equal(isAllowedMediaHost('atacante.com'), false);
});

// --- Extraccion del adjunto desde el webhook --------------------------------

function webhook(message: Record<string, unknown>) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: '111', display_phone_number: '+56911111111' },
              contacts: [{ wa_id: '56922222222', profile: { name: 'Cliente' } }],
              messages: [{ id: 'wamid.1', from: '56922222222', timestamp: '1757000000', ...message }],
            },
          },
        ],
      },
    ],
  };
}

test('recoge el identificador del adjunto de cada tipo de mensaje', () => {
  const casos = [
    { payload: { type: 'image', image: { id: 'media-1', mime_type: 'image/jpeg' } }, id: 'media-1' },
    { payload: { type: 'audio', audio: { id: 'media-2', mime_type: 'audio/ogg' } }, id: 'media-2' },
    { payload: { type: 'video', video: { id: 'media-3', mime_type: 'video/mp4' } }, id: 'media-3' },
    {
      payload: {
        type: 'document',
        document: { id: 'media-4', mime_type: 'application/pdf', filename: 'orden.pdf' },
      },
      id: 'media-4',
    },
    // Un sticker es un medio aunque el CRM lo guarde como imagen.
    { payload: { type: 'sticker', sticker: { id: 'media-5', mime_type: 'image/webp' } }, id: 'media-5' },
  ];

  for (const caso of casos) {
    const [event] = normalizeWebhookPayload(webhook(caso.payload));
    assert.equal(event?.kind, 'message');
    assert.equal(event?.kind === 'message' ? event.media?.externalMediaId : null, caso.id);
  }
});

test('conserva el nombre del documento y el tipo declarado', () => {
  const [event] = normalizeWebhookPayload(
    webhook({
      type: 'document',
      document: { id: 'media-9', mime_type: 'application/pdf', filename: 'cotizacion.pdf' },
    }),
  );

  assert.equal(event?.kind, 'message');
  if (event?.kind !== 'message') return;
  assert.equal(event.media?.fileName, 'cotizacion.pdf');
  assert.equal(event.media?.declaredMime, 'application/pdf');
});

test('un mensaje de texto no inventa un adjunto', () => {
  const [event] = normalizeWebhookPayload(webhook({ type: 'text', text: { body: 'hola' } }));
  assert.equal(event?.kind === 'message' ? event.media : 'no-es-mensaje', undefined);
});

test('un adjunto sin identificador no se recoge a medias', () => {
  const [event] = normalizeWebhookPayload(
    webhook({ type: 'image', image: { mime_type: 'image/jpeg' } }),
  );
  assert.equal(event?.kind === 'message' ? event.media : 'no-es-mensaje', undefined);
});
