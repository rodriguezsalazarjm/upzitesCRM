import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { isEncryptionConfigured } from '@/lib/crypto';
import { canManageMercadoPago } from '@/lib/mercado-pago';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** Estado de la conexion. Nunca devuelve el token ni el secreto de webhook. */
export async function GET() {
  const user = await requireCurrentUser();

  const connection = await prisma.mercadoPagoConnection.findUnique({
    where: { workspaceId: user.workspace.id },
    select: {
      mode: true,
      publicKey: true,
      status: true,
      connectedAt: true,
      lastVerifiedAt: true,
      lastError: true,
    },
  });

  return NextResponse.json({
    data: connection ? { ...connection, saved: true } : null,
    canManage: canManageMercadoPago(user.role),
    encryptionConfigured: isEncryptionConfigured(),
  });
}
