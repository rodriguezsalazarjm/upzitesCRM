import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  CommerceProvider,
  IntegrationProvider,
  IntegrationStatus,
} from '../../../../../../generated/prisma/client';
import { encryptSecret } from '@/lib/crypto';
import { recordAudit } from '@/lib/domain/audit';
import { prisma } from '@/lib/prisma';
import {
  exchangeCodeForToken,
  getShopifyConfig,
  isValidShopDomain,
  verifyCallbackHmac,
  verifyState,
} from '@/lib/shopify/oauth';
import { SHOPIFY_NONCE_COOKIE } from '../connect/route';

export const dynamic = 'force-dynamic';

/**
 * Callback de OAuth.
 *
 * Orden de los controles, de mas barato a mas caro: HMAC de la query, dominio,
 * state firmado, nonce de la cookie. Recien despues se canjea el code, que es
 * lo unico que hace una peticion saliente.
 */
export async function GET(request: Request) {
  const config = getShopifyConfig();
  if (!config) {
    return NextResponse.json({ message: 'Shopify no esta configurado.' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const shop = (searchParams.get('shop') ?? '').trim().toLowerCase();
  const code = searchParams.get('code') ?? '';
  const state = searchParams.get('state') ?? '';

  const hmac = verifyCallbackHmac(searchParams, config.apiSecret);
  if (!hmac.valid) {
    console.warn('shopify_callback_invalid_hmac', { reason: hmac.reason, shop });
    return NextResponse.json({ message: 'Firma invalida' }, { status: 401 });
  }

  if (!isValidShopDomain(shop)) {
    return NextResponse.json({ message: 'Dominio de tienda invalido' }, { status: 400 });
  }

  const stateCheck = verifyState(state, config.apiSecret);
  if (!stateCheck.valid) {
    console.warn('shopify_callback_invalid_state', { reason: stateCheck.reason, shop });
    return NextResponse.json({ message: 'State invalido' }, { status: 401 });
  }

  // El state dice a que tienda pertenece: si no coincide con la del callback,
  // alguien esta cruzando flujos.
  if (stateCheck.payload.shop !== shop) {
    return NextResponse.json({ message: 'La tienda no coincide con la solicitud' }, { status: 401 });
  }

  const cookieStore = await cookies();
  const nonce = cookieStore.get(SHOPIFY_NONCE_COOKIE)?.value;

  if (!nonce || nonce !== stateCheck.payload.nonce) {
    console.warn('shopify_callback_nonce_mismatch', { shop });
    return NextResponse.json({ message: 'La sesion de instalacion no coincide' }, { status: 401 });
  }

  if (!code) {
    return NextResponse.json({ message: 'Falta el code' }, { status: 400 });
  }

  const exchange = await exchangeCodeForToken({ shop, code, config });
  if (!exchange.ok) {
    console.error('shopify_token_exchange_failed', { shop, error: exchange.error });
    return NextResponse.json({ message: 'No se pudo obtener el token de la tienda' }, { status: 502 });
  }

  const workspaceId = stateCheck.payload.workspaceId;

  // Una tienda pertenece a un solo workspace: si ya esta tomada por otro, se
  // rechaza en vez de reasignarla en silencio.
  const taken = await prisma.commerceConnection.findFirst({
    where: { provider: CommerceProvider.SHOPIFY, shopDomain: shop },
    select: { workspaceId: true },
  });

  if (taken && taken.workspaceId !== workspaceId) {
    return NextResponse.json({ message: 'Esa tienda ya esta conectada a otra cuenta.' }, { status: 409 });
  }

  await prisma.commerceConnection.upsert({
    where: { workspaceId_provider: { workspaceId, provider: CommerceProvider.SHOPIFY } },
    create: {
      workspaceId,
      provider: CommerceProvider.SHOPIFY,
      shopDomain: shop,
      scopes: exchange.scope ? exchange.scope.split(',') : [],
      accessTokenEncrypted: encryptSecret(exchange.accessToken),
      status: 'CONNECTED',
    },
    update: {
      shopDomain: shop,
      scopes: exchange.scope ? exchange.scope.split(',') : [],
      accessTokenEncrypted: encryptSecret(exchange.accessToken),
      status: 'CONNECTED',
    },
  });

  await prisma.integration.upsert({
    where: { workspaceId_provider: { workspaceId, provider: IntegrationProvider.SHOPIFY } },
    create: {
      workspaceId,
      provider: IntegrationProvider.SHOPIFY,
      name: 'Shopify',
      status: IntegrationStatus.CONNECTED,
      lastSyncAt: new Date(),
    },
    update: { status: IntegrationStatus.CONNECTED, lastSyncAt: new Date() },
  });

  await recordAudit({
    workspaceId,
    action: 'shopify.connected',
    entity: 'CommerceConnection',
    // El token no entra al audit log, solo los scopes concedidos.
    metadata: { shop, scopes: exchange.scope },
  });

  cookieStore.delete(SHOPIFY_NONCE_COOKIE);

  const appUrl = (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? config.appUrl).replace(/\/+$/, '');
  return NextResponse.redirect(`${appUrl}/integraciones?shopify=conectado`);
}
