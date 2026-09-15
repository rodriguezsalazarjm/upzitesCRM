import { NextResponse } from 'next/server';
import { z } from 'zod';
import { IntegrationStatus, MercadoPagoMode } from '../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { EncryptionKeyMissingError, encryptSecret } from '@/lib/crypto';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import {
  MercadoPagoCredentialError,
  canManageMercadoPago,
  verifyMercadoPagoAccessToken,
} from '@/lib/mercado-pago';
import { prisma } from '@/lib/prisma';

const connectSchema = z.object({
  accessToken: z.string().min(20, 'El access token no parece completo.').max(512),
  webhookSecret: z.string().min(10, 'El secreto de webhook no parece completo.').max(512),
  publicKey: z.string().max(512).optional(),
  mode: z.enum(['TEST', 'PRODUCTION']),
});

/**
 * Conecta la cuenta de Mercado Pago DEL WORKSPACE (no la de Upzites): la que
 * cobra sus propios productos. Onboarding manual (pegar credenciales), igual
 * que WhatsApp — Mercado Pago Connect (OAuth) queda para una fase posterior.
 */
export async function POST(request: Request) {
  const user = await requireCurrentUser();

  if (!canManageMercadoPago(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede conectar Mercado Pago.' },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, connectSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  // El prefijo del token declara su propio modo; no confiamos en el select
  // del formulario para decidir si es dinero real o de prueba.
  const detectedMode = input.accessToken.startsWith('APP_USR-')
    ? 'PRODUCTION'
    : input.accessToken.startsWith('TEST-')
      ? 'TEST'
      : null;
  if (detectedMode && detectedMode !== input.mode) {
    return NextResponse.json(
      {
        message: `Este token es de modo ${detectedMode === 'TEST' ? 'prueba' : 'produccion'}, pero elegiste ${input.mode === 'TEST' ? 'prueba' : 'produccion'}.`,
      },
      { status: 400 },
    );
  }

  let profile;
  try {
    profile = await verifyMercadoPagoAccessToken(input.accessToken);
  } catch (error) {
    if (error instanceof MercadoPagoCredentialError) {
      return NextResponse.json({ message: error.message }, { status: 422 });
    }
    throw error;
  }

  let accessTokenEncrypted: string;
  let webhookSecretEncrypted: string;
  try {
    accessTokenEncrypted = encryptSecret(input.accessToken);
    webhookSecretEncrypted = encryptSecret(input.webhookSecret);
  } catch (error) {
    if (error instanceof EncryptionKeyMissingError) {
      return NextResponse.json({ message: error.message }, { status: 503 });
    }
    throw error;
  }

  const existing = await prisma.mercadoPagoConnection.findUnique({
    where: { workspaceId: user.workspace.id },
    select: { id: true },
  });

  const now = new Date();
  const connection = await prisma.$transaction(async (tx) => {
    const saved = await tx.mercadoPagoConnection.upsert({
      where: { workspaceId: user.workspace.id },
      create: {
        workspaceId: user.workspace.id,
        mode: input.mode as MercadoPagoMode,
        publicKey: input.publicKey ?? null,
        accessTokenEncrypted,
        webhookSecretEncrypted,
        status: IntegrationStatus.CONNECTED,
        connectedAt: now,
        lastVerifiedAt: now,
        lastError: null,
      },
      update: {
        mode: input.mode as MercadoPagoMode,
        publicKey: input.publicKey ?? null,
        accessTokenEncrypted,
        webhookSecretEncrypted,
        status: IntegrationStatus.CONNECTED,
        lastVerifiedAt: now,
        lastError: null,
      },
      select: { mode: true, publicKey: true, status: true, connectedAt: true, lastVerifiedAt: true },
    });

    await recordAudit(
      {
        workspaceId: user.workspace.id,
        actorId: user.id,
        action: existing ? 'mercado_pago.credentials_updated' : 'mercado_pago.connected',
        entity: 'MercadoPagoConnection',
        metadata: { mode: input.mode, accountId: profile.accountId, email: profile.email },
      },
      tx,
    );

    return saved;
  });

  return NextResponse.json({ data: { ...connection, account: profile } }, { status: 201 });
}
