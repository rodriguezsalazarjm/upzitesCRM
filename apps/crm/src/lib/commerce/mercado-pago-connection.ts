import { decryptSecret } from '../crypto';
import { prisma } from '../prisma';
import { IntegrationStatus } from '../../../generated/prisma/client';

export type WorkspaceMercadoPagoConnection = {
  workspaceId: string;
  mode: 'TEST' | 'PRODUCTION';
  accessToken: string;
  webhookSecret: string;
};

/**
 * Carga y descifra la conexion de Mercado Pago de un workspace. Null si no
 * conecto una cuenta, o si no esta CONNECTED (evita cobrar con una conexion
 * marcada NEEDS_ATTENTION por el operador).
 *
 * Vive fuera de mercado-pago.ts a proposito: ese archivo no importa prisma,
 * asi que sus funciones puras (validacion de firma, verificacion de token)
 * se pueden probar con node:test sin necesitar DATABASE_URL.
 */
export async function getWorkspaceMercadoPagoConnection(
  workspaceId: string,
): Promise<WorkspaceMercadoPagoConnection | null> {
  const connection = await prisma.mercadoPagoConnection.findUnique({ where: { workspaceId } });
  if (
    !connection ||
    connection.status !== IntegrationStatus.CONNECTED ||
    !connection.accessTokenEncrypted ||
    !connection.webhookSecretEncrypted
  ) {
    return null;
  }

  return {
    workspaceId,
    mode: connection.mode,
    accessToken: decryptSecret(connection.accessTokenEncrypted),
    webhookSecret: decryptSecret(connection.webhookSecretEncrypted),
  };
}
