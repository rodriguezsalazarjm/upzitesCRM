import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { createHmac } from 'node:crypto';
import {
  buildMercadoPagoAuthorizationUrl,
  canManageMercadoPago,
  exchangeMercadoPagoOAuthCode,
  getPlatformOAuthConfig,
  MercadoPagoCredentialError,
  refreshMercadoPagoOAuthToken,
  verifyMercadoPagoAccessToken,
  verifyWebhookSignature,
  verifyWorkspaceWebhookSignature,
} from './mercado-pago';
import { UserRole } from '../../generated/prisma/client';

/**
 * Reproduce exactamente el manifest que arma el validador del SDK. `ts` va en
 * MILISEGUNDOS (Date.now()): el validador lo compara tal cual contra
 * Date.now() para el chequeo de tolerancia, no contra epoch en segundos.
 */
function sign(secret: string, dataId: string, requestId: string, ts: number) {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const hash = createHmac('sha256', secret).update(manifest).digest('hex');
  return `ts=${ts},v1=${hash}`;
}

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

describe('verifyWebhookSignature (cuenta de Upzites)', () => {
  test('acepta una firma valida contra MERCADO_PAGO_WEBHOOK_SECRET', () => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'secreto-plataforma';
    const ts = Date.now();
    const xSignature = sign('secreto-plataforma', 'PAY-1', 'req-1', ts);

    const result = verifyWebhookSignature({ xSignature, xRequestId: 'req-1', dataId: 'PAY-1' });
    assert.deepEqual(result, { valid: true });
  });

  test('rechaza si el secreto no esta configurado', () => {
    delete process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    const result = verifyWebhookSignature({ xSignature: 'ts=1,v1=x', xRequestId: 'r', dataId: 'PAY-1' });
    assert.equal(result.valid, false);
  });

  test('rechaza una firma calculada con un secreto distinto', () => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'secreto-plataforma';
    const ts = Date.now();
    const xSignature = sign('otro-secreto', 'PAY-1', 'req-1', ts);

    const result = verifyWebhookSignature({ xSignature, xRequestId: 'req-1', dataId: 'PAY-1' });
    assert.equal(result.valid, false);
  });
});

describe('verifyWorkspaceWebhookSignature (cuenta de un workspace)', () => {
  test('valida contra el secreto DE ESE workspace, no el de plataforma', () => {
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = 'secreto-plataforma';
    const ts = Date.now();
    const xSignature = sign('secreto-workspace-a', 'PAY-2', 'req-2', ts);

    const okForA = verifyWorkspaceWebhookSignature({
      xSignature,
      xRequestId: 'req-2',
      dataId: 'PAY-2',
      webhookSecret: 'secreto-workspace-a',
    });
    assert.deepEqual(okForA, { valid: true });

    // La MISMA firma no vale con el secreto de otro workspace: aislamiento
    // de credenciales entre tenants, no solo de datos.
    const rejectedForB = verifyWorkspaceWebhookSignature({
      xSignature,
      xRequestId: 'req-2',
      dataId: 'PAY-2',
      webhookSecret: 'secreto-workspace-b',
    });
    assert.equal(rejectedForB.valid, false);

    // Y tampoco vale con el secreto de la PLATAFORMA: las dos cuentas no
    // se pueden confundir entre si.
    const rejectedForPlatform = verifyWorkspaceWebhookSignature({
      xSignature,
      xRequestId: 'req-2',
      dataId: 'PAY-2',
      webhookSecret: 'secreto-plataforma',
    });
    assert.equal(rejectedForPlatform.valid, false);
  });
});

describe('canManageMercadoPago', () => {
  test('solo OWNER y ADMIN pueden conectar/desconectar', () => {
    assert.equal(canManageMercadoPago(UserRole.OWNER), true);
    assert.equal(canManageMercadoPago(UserRole.ADMIN), true);
    assert.equal(canManageMercadoPago(UserRole.SALES), false);
  });
});

describe('verifyMercadoPagoAccessToken', () => {
  test('devuelve la identidad de la cuenta cuando el token es valido', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ id: 42, email: 'owner@negocio.test', site_id: 'MLC' }), {
        status: 200,
      })) as typeof fetch;

    const profile = await verifyMercadoPagoAccessToken('TEST-token-valido');
    assert.deepEqual(profile, { accountId: 42, email: 'owner@negocio.test', siteId: 'MLC' });
  });

  test('rechaza un token invalido sin guardar nada', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: 'invalid_token' }), { status: 401 })) as typeof fetch;

    await assert.rejects(
      () => verifyMercadoPagoAccessToken('token-invalido'),
      MercadoPagoCredentialError,
    );
  });
});

describe('getPlatformOAuthConfig', () => {
  test('null si falta cualquiera de las tres variables de la aplicacion', () => {
    delete process.env.MERCADO_PAGO_CLIENT_ID;
    delete process.env.MERCADO_PAGO_CLIENT_SECRET;
    delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
    assert.equal(getPlatformOAuthConfig(), null);

    process.env.MERCADO_PAGO_CLIENT_ID = 'client-1';
    process.env.MERCADO_PAGO_CLIENT_SECRET = 'secret-1';
    assert.equal(getPlatformOAuthConfig(), null); // falta el access token de plataforma

    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'APP_USR-plataforma';
    assert.deepEqual(getPlatformOAuthConfig(), {
      clientId: 'client-1',
      clientSecret: 'secret-1',
      platformAccessToken: 'APP_USR-plataforma',
    });
  });
});

describe('buildMercadoPagoAuthorizationUrl', () => {
  test('apunta a auth.mercadopago.com con client_id, state y redirect_uri', () => {
    const url = buildMercadoPagoAuthorizationUrl({
      config: { clientId: 'client-1', clientSecret: 'secret-1', platformAccessToken: 'token-1' },
      state: 'state-firmado',
      redirectUri: 'https://crm.test/api/integrations/mercado-pago/oauth/callback',
    });
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://auth.mercadopago.com');
    assert.equal(parsed.searchParams.get('client_id'), 'client-1');
    assert.equal(parsed.searchParams.get('state'), 'state-firmado');
    assert.equal(
      parsed.searchParams.get('redirect_uri'),
      'https://crm.test/api/integrations/mercado-pago/oauth/callback',
    );
    assert.equal(parsed.searchParams.get('response_type'), 'code');
  });
});

describe('exchangeMercadoPagoOAuthCode', () => {
  const config = { clientId: 'client-1', clientSecret: 'secret-1', platformAccessToken: 'platform-token' };

  test('canjea el code y devuelve access/refresh token, vendedor y modo', async () => {
    let sentBody: Record<string, unknown> | undefined;
    let sentAuth: string | null = null;
    globalThis.fetch = (async (_input, init) => {
      sentBody = JSON.parse(String(init?.body));
      sentAuth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? null;
      return new Response(
        JSON.stringify({
          access_token: 'seller-access-token',
          refresh_token: 'seller-refresh-token',
          expires_in: 21600,
          user_id: 555,
          public_key: 'pub-key',
          live_mode: false,
          scope: 'read write',
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const tokens = await exchangeMercadoPagoOAuthCode({
      config,
      code: 'auth-code-1',
      redirectUri: 'https://crm.test/callback',
    });

    assert.deepEqual(tokens, {
      accessToken: 'seller-access-token',
      refreshToken: 'seller-refresh-token',
      expiresInSeconds: 21600,
      mercadoPagoUserId: '555',
      publicKey: 'pub-key',
      liveMode: false,
      scope: 'read write',
    });
    // Autentica con el Bearer de la PLATAFORMA (Upzites), no con nada del vendedor.
    assert.equal(sentAuth, 'Bearer platform-token');
    assert.equal(sentBody?.client_id, 'client-1');
    assert.equal(sentBody?.client_secret, 'secret-1');
    assert.equal(sentBody?.code, 'auth-code-1');
    assert.equal(sentBody?.grant_type, 'authorization_code');
  });

  test('un code invalido/ya usado lanza MercadoPagoCredentialError sin guardar nada', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: 'invalid_grant' }), { status: 400 })) as typeof fetch;

    await assert.rejects(
      () => exchangeMercadoPagoOAuthCode({ config, code: 'code-ya-usado', redirectUri: 'https://crm.test/callback' }),
      MercadoPagoCredentialError,
    );
  });
});

describe('refreshMercadoPagoOAuthToken', () => {
  const config = { clientId: 'client-1', clientSecret: 'secret-1', platformAccessToken: 'platform-token' };

  test('renueva con el refresh token guardado y devuelve credenciales nuevas', async () => {
    let sentBody: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_input, init) => {
      sentBody = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          access_token: 'nuevo-access-token',
          refresh_token: 'nuevo-refresh-token',
          expires_in: 21600,
          user_id: 555,
          live_mode: false,
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const tokens = await refreshMercadoPagoOAuthToken({ config, refreshToken: 'refresh-viejo' });
    assert.equal(tokens.accessToken, 'nuevo-access-token');
    assert.equal(sentBody?.refresh_token, 'refresh-viejo');
    assert.equal(sentBody?.grant_type, 'refresh_token');
  });

  test('un refresh token revocado lanza MercadoPagoCredentialError', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ message: 'invalid_grant: token revoked' }), { status: 400 })) as typeof fetch;

    await assert.rejects(
      () => refreshMercadoPagoOAuthToken({ config, refreshToken: 'refresh-revocado' }),
      MercadoPagoCredentialError,
    );
  });
});
