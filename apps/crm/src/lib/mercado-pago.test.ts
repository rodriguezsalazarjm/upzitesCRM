import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { createHmac } from 'node:crypto';
import {
  canManageMercadoPago,
  MercadoPagoCredentialError,
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
