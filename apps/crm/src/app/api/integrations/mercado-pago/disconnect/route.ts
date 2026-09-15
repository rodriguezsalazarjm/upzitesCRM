import { NextResponse } from 'next/server';
import { IntegrationStatus } from '../../../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/domain/audit';
import { canManageMercadoPago } from '@/lib/mercado-pago';
import { prisma } from '@/lib/prisma';

/**
 * Desconecta la cuenta de Mercado Pago del workspace y BORRA las credenciales
 * cifradas. Los pedidos/pagos ya registrados se conservan: desconectar no
 * borra historial, solo impide cobrar hasta que se reconecte.
 */
export async function POST() {
  const user = await requireCurrentUser();

  if (!canManageMercadoPago(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede desconectar Mercado Pago.' },
      { status: 403 },
    );
  }

  const existing = await prisma.mercadoPagoConnection.findUnique({
    where: { workspaceId: user.workspace.id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ message: 'No hay una conexion guardada.' }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.mercadoPagoConnection.update({
      where: { workspaceId: user.workspace.id },
      data: {
        status: IntegrationStatus.DISCONNECTED,
        accessTokenEncrypted: null,
        webhookSecretEncrypted: null,
        lastError: null,
      },
    });

    await recordAudit(
      {
        workspaceId: user.workspace.id,
        actorId: user.id,
        action: 'mercado_pago.disconnected',
        entity: 'MercadoPagoConnection',
      },
      tx,
    );
  });

  return NextResponse.json({ ok: true });
}
