import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { MetaWhatsAppError, verifyAndSubscribeWhatsAppChannel } from './meta';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('valida pertenencia del numero y suscribe la app sin poner el token en la URL', async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const responses = [
    new Response(
      JSON.stringify({
        data: [
          {
            id: 'phone-1',
            display_phone_number: '+1 555 0100',
            verified_name: 'Piloto',
            quality_rating: 'GREEN',
          },
        ],
      }),
      { status: 200 },
    ),
    new Response(JSON.stringify({ success: true }), { status: 200 }),
  ];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return responses.shift()!;
  };

  const result = await verifyAndSubscribeWhatsAppChannel({
    wabaId: 'waba-1',
    phoneNumberId: 'phone-1',
    accessToken: 'secret-token-value',
  });

  assert.equal(result.displayPhoneNumber, '+1 555 0100');
  assert.equal(result.verifiedName, 'Piloto');
  assert.equal(requests.length, 2);
  assert.match(requests[0].url, /waba-1\/phone_numbers/);
  assert.match(requests[1].url, /waba-1\/subscribed_apps/);
  assert.equal(requests[1].init?.method, 'POST');
  assert.equal(
    requests.some((request) => request.url.includes('secret-token-value')),
    false,
  );
  assert.equal(
    (requests[0].init?.headers as Record<string, string>).Authorization,
    'Bearer secret-token-value',
  );
});

test('rechaza un Phone Number ID que no pertenece a la WABA', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(
      JSON.stringify({ data: [{ id: 'otro', display_phone_number: '+1 555' }] }),
      {
        status: 200,
      },
    );
  };

  await assert.rejects(
    verifyAndSubscribeWhatsAppChannel({
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      accessToken: 'secret-token-value',
    }),
    (error: unknown) => error instanceof MetaWhatsAppError && error.code === 'PHONE_NOT_IN_WABA',
  );
  assert.equal(calls, 1);
});

test('un token invalido produce un error seguro sin copiar el mensaje de Meta', async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: { code: 190, message: 'Invalid OAuth access token: secret-token-value' },
      }),
      { status: 401 },
    );

  await assert.rejects(
    verifyAndSubscribeWhatsAppChannel({
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      accessToken: 'secret-token-value',
    }),
    (error: unknown) =>
      error instanceof MetaWhatsAppError &&
      error.code === 'INVALID_CREDENTIALS' &&
      !error.message.includes('secret-token-value'),
  );
});

test('no guarda como suscrito si Meta no confirma subscribed_apps', async () => {
  const responses = [
    new Response(
      JSON.stringify({ data: [{ id: 'phone-1', display_phone_number: '+1 555 0100' }] }),
      { status: 200 },
    ),
    new Response(JSON.stringify({ success: false }), { status: 200 }),
  ];
  globalThis.fetch = async () => responses.shift()!;

  await assert.rejects(
    verifyAndSubscribeWhatsAppChannel({
      wabaId: 'waba-1',
      phoneNumberId: 'phone-1',
      accessToken: 'secret-token-value',
    }),
    (error: unknown) => error instanceof MetaWhatsAppError && error.code === 'SUBSCRIPTION_FAILED',
  );
});
