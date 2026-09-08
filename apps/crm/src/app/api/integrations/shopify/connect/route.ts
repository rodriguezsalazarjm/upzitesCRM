import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { recordAudit } from '@/lib/domain/audit';
import { isEncryptionConfigured } from '@/lib/crypto';
import {
  buildInstallUrl,
  createState,
  getShopifyConfig,
  isValidShopDomain,
} from '@/lib/shopify/oauth';

export const dynamic = 'force-dynamic';

export const SHOPIFY_NONCE_COOKIE = 'upzites_shopify_nonce';

/**
 * Inicia la instalacion: valida el dominio, firma un `state` y redirige.
 *
 * El nonce viaja por dos canales —dentro del state firmado y en una cookie
 * httpOnly— y el callback exige que coincidan. Asi, alguien que consiga un
 * state valido no puede completar el flujo desde otro navegador.
 */
export async function GET(request: Request) {
  const user = await requireCurrentUser();

  if (!canManageChannels(user.role)) {
    return NextResponse.json({ message: 'Solo el owner o un admin puede conectar Shopify.' }, { status: 403 });
  }

  const config = getShopifyConfig();
  if (!config) {
    return NextResponse.json(
      { message: 'Shopify no esta configurado: faltan SHOPIFY_API_KEY y SHOPIFY_API_SECRET.' },
      { status: 503 },
    );
  }

  if (!isEncryptionConfigured()) {
    return NextResponse.json(
      { message: 'Falta INTEGRATION_ENCRYPTION_KEY: no se puede guardar el token de la tienda.' },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const shop = (searchParams.get('shop') ?? '').trim().toLowerCase();

  // Sin esta validacion, `shop` arbitrario haria que el servidor negocie tokens
  // contra un host cualquiera.
  if (!isValidShopDomain(shop)) {
    return NextResponse.json(
      { message: 'El dominio debe ser <tienda>.myshopify.com' },
      { status: 400 },
    );
  }

  const { state, nonce } = createState({ workspaceId: user.workspace.id, shop }, config.apiSecret);

  const cookieStore = await cookies();
  cookieStore.set(SHOPIFY_NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 600,
  });

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'shopify.install_started',
    entity: 'CommerceConnection',
    metadata: { shop },
  });

  return NextResponse.redirect(buildInstallUrl({ shop, state, config }));
}
