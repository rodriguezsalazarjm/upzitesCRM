import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { encryptSecret } from '@/lib/crypto';
import { recordAudit } from '@/lib/domain/audit';
import { prisma } from '@/lib/prisma';
import { MESSENGER_OAUTH_SCOPES } from '@/lib/messenger/oauth';
import { MESSENGER_PENDING_COOKIE, decodeMessengerPendingSelection } from '@/lib/messenger/pending-selection';
import { ensureMessengerWebhookSubscription } from '@/lib/messenger/webhook-subscription';

export const dynamic = 'force-dynamic';

/**
 * Finaliza la conexion de Messenger con la Page que el usuario eligio
 * explicitamente (nunca la primera de la lista en silencio).
 */
export async function POST(request: Request) {
  const user = await requireCurrentUser();
  if (!canManageChannels(user.role)) {
    return NextResponse.json({ message: 'Solo el owner o un admin puede conectar Messenger.' }, { status: 403 });
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get(MESSENGER_PENDING_COOKIE)?.value;
  const pending = raw ? decodeMessengerPendingSelection(raw) : null;
  if (!pending || pending.userId !== user.id || pending.workspaceId !== user.workspace.id) {
    return NextResponse.json({ message: 'La selección de Página expiró o no coincide con tu sesión. Reconecta Messenger.' }, { status: 401 });
  }

  const { pageId } = (await request.json().catch(() => ({}))) as { pageId?: string };
  const page = pending.pages.find((candidate) => candidate.id === pageId);
  if (!page) return NextResponse.json({ message: 'Página no encontrada en la lista pendiente.' }, { status: 400 });

  // Una Page pertenece a un solo workspace: si ya esta conectada a otro, se
  // rechaza en vez de reasignarla en silencio.
  const taken = await prisma.channelAccount.findUnique({
    where: { channel_externalAccountId: { channel: 'MESSENGER', externalAccountId: page.id } },
    select: { workspaceId: true },
  });
  if (taken && taken.workspaceId !== user.workspace.id) {
    return NextResponse.json({ message: 'Esa Página ya está conectada a otro workspace.' }, { status: 409 });
  }

  await prisma.channelAccount.upsert({
    where: { channel_externalAccountId: { channel: 'MESSENGER', externalAccountId: page.id } },
    create: {
      workspaceId: user.workspace.id,
      channel: 'MESSENGER',
      connectionMethod: 'OAUTH',
      externalAccountId: page.id,
      displayName: page.name,
      accessTokenEncrypted: encryptSecret(page.accessToken),
      accessTokenExpiresAt: null, // Page token via long-lived user token: no vence (revisar en "Verificar conexion").
      scopes: MESSENGER_OAUTH_SCOPES.join(','),
      capabilities: [],
      status: 'CONNECTED',
      connectedAt: new Date(),
      lastVerifiedAt: new Date(),
      lastErrorCode: null,
      lastError: null,
      metadata: { authorization: { mechanism: 'FACEBOOK_LOGIN', tokenType: 'PAGE', pageId: page.id } },
    },
    update: {
      workspaceId: user.workspace.id,
      displayName: page.name,
      accessTokenEncrypted: encryptSecret(page.accessToken),
      accessTokenExpiresAt: null,
      status: 'CONNECTED',
      connectedAt: new Date(),
      lastVerifiedAt: new Date(),
      lastErrorCode: null,
      lastError: null,
      metadata: { authorization: { mechanism: 'FACEBOOK_LOGIN', tokenType: 'PAGE', pageId: page.id } },
    },
  });

  try {
    await ensureMessengerWebhookSubscription({ pageId: page.id, pageAccessToken: page.accessToken });
  } catch (error) {
    console.error('messenger_webhook_subscription_failed', { workspaceId: user.workspace.id, error: error instanceof Error ? error.message : error });
  }

  await recordAudit({
    workspaceId: user.workspace.id,
    actorId: user.id,
    action: 'messenger.oauth_connected',
    entity: 'ChannelAccount',
    metadata: { pageId: page.id, pageName: page.name },
  });

  cookieStore.delete(MESSENGER_PENDING_COOKIE);
  return NextResponse.json({ ok: true });
}
