import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyInstagramConnection } from './webhook-subscription';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function fakeChannelAccount() {
  const updates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  return {
    updates,
    update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
      updates.push(args);
      return args;
    },
  };
}

test('suscripcion exitosa y confirmada deja la cuenta CONNECTED', async () => {
  const channelAccount = fakeChannelAccount();
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL) => {
    const href = url.toString();
    calls.push(href);
    if (href.includes('/me?')) return jsonResponse(200, { user_id: 'ig_123' });
    if (href.includes('/subscribed_apps') && href.includes('subscribed_fields=')) {
      return jsonResponse(200, { success: true });
    }
    if (href.includes('/subscribed_apps')) {
      return jsonResponse(200, { data: [{ subscribed_fields: ['messages', 'comments'] }] });
    }
    throw new Error(`unexpected url ${href}`);
  }) as typeof fetch;

  const result = await verifyInstagramConnection({
    channelAccountId: 'acc_1',
    accessToken: 'token',
    fetchImpl,
    prismaChannelAccount: channelAccount,
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 3);
  const lastUpdate = channelAccount.updates.at(-1);
  assert.equal(lastUpdate?.data.status, 'CONNECTED');
  assert.equal(lastUpdate?.data.lastErrorCode, null);
  assert.equal(lastUpdate?.data.lastError, null);
  assert.ok(lastUpdate?.data.lastVerifiedAt instanceof Date);
});

test('si Meta rechaza la suscripcion (POST subscribed_apps falla), la cuenta queda NEEDS_ATTENTION', async () => {
  const channelAccount = fakeChannelAccount();
  const fetchImpl = (async (url: string | URL) => {
    const href = url.toString();
    if (href.includes('/me?')) return jsonResponse(200, { user_id: 'ig_123' });
    if (href.includes('/subscribed_apps')) {
      return jsonResponse(400, { error: { message: 'Meta rechazo la suscripcion' } });
    }
    throw new Error(`unexpected url ${href}`);
  }) as typeof fetch;

  const result = await verifyInstagramConnection({
    channelAccountId: 'acc_1',
    accessToken: 'token',
    fetchImpl,
    prismaChannelAccount: channelAccount,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /Meta rechazo la suscripcion/);
  const update = channelAccount.updates.at(-1);
  assert.equal(update?.data.status, 'NEEDS_ATTENTION');
  assert.equal(update?.data.lastErrorCode, 'SUBSCRIBE_FAILED');
  assert.equal(update?.data.lastError, 'Meta rechazo la suscripcion');
});

test('si la cuenta no aparece suscrita a messages/comments tras confirmar, queda NEEDS_ATTENTION', async () => {
  const channelAccount = fakeChannelAccount();
  const fetchImpl = (async (url: string | URL) => {
    const href = url.toString();
    if (href.includes('/me?')) return jsonResponse(200, { user_id: 'ig_123' });
    if (href.includes('subscribed_fields=')) return jsonResponse(200, { success: true });
    if (href.includes('/subscribed_apps')) return jsonResponse(200, { data: [{ subscribed_fields: ['messages'] }] });
    throw new Error(`unexpected url ${href}`);
  }) as typeof fetch;

  const result = await verifyInstagramConnection({
    channelAccountId: 'acc_1',
    accessToken: 'token',
    fetchImpl,
    prismaChannelAccount: channelAccount,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.reason, /comments/);
  const update = channelAccount.updates.at(-1);
  assert.equal(update?.data.status, 'NEEDS_ATTENTION');
  assert.equal(update?.data.lastErrorCode, 'SUBSCRIPTION_INCOMPLETE');
});

test('el estado NEEDS_ATTENTION persiste (no se sobrescribe con CONNECTED) cuando falla la confirmacion', async () => {
  const channelAccount = fakeChannelAccount();
  const fetchImpl = (async (url: string | URL) => {
    const href = url.toString();
    if (href.includes('/me?')) return jsonResponse(200, { user_id: 'ig_123' });
    if (href.includes('subscribed_fields=')) return jsonResponse(200, { success: true });
    if (href.includes('/subscribed_apps')) return jsonResponse(200, { data: [] });
    throw new Error(`unexpected url ${href}`);
  }) as typeof fetch;

  const result = await verifyInstagramConnection({
    channelAccountId: 'acc_1',
    accessToken: 'token',
    fetchImpl,
    prismaChannelAccount: channelAccount,
  });

  assert.equal(result.ok, false);
  assert.equal(channelAccount.updates.length, 1);
  assert.equal(channelAccount.updates[0]?.data.status, 'NEEDS_ATTENTION');
  const connectedUpdates = channelAccount.updates.filter((u) => u.data.status === 'CONNECTED');
  assert.equal(connectedUpdates.length, 0);
});

test('si /me falla, la cuenta queda REAUTH_REQUIRED y nunca llega a suscribir', async () => {
  const channelAccount = fakeChannelAccount();
  let subscribeCalled = false;
  const fetchImpl = (async (url: string | URL) => {
    const href = url.toString();
    if (href.includes('/me?')) return jsonResponse(401, { error: { message: 'token invalido' } });
    subscribeCalled = true;
    throw new Error(`unexpected url ${href}`);
  }) as typeof fetch;

  const result = await verifyInstagramConnection({
    channelAccountId: 'acc_1',
    accessToken: 'token',
    fetchImpl,
    prismaChannelAccount: channelAccount,
  });

  assert.equal(result.ok, false);
  assert.equal(subscribeCalled, false);
  const update = channelAccount.updates.at(-1);
  assert.equal(update?.data.status, 'REAUTH_REQUIRED');
  assert.equal(update?.data.lastErrorCode, 'VERIFY_FAILED');
});
