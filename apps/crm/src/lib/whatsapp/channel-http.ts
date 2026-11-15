import { NextResponse } from 'next/server';
import { requireCurrentUser } from '../auth';
import { EncryptionKeyMissingError } from '../crypto';
import { EntitlementError } from '../entitlements';
import { entitlementResponse } from '../entitlements/http';
import { ChannelOutboundError } from '../channels/outbound';
import { ChannelManagerError, type ChannelActor } from './channel-manager';
import type { WorkspaceRole } from '../../../generated/prisma/client';
import { MetaWhatsAppError } from './meta';
import { isWhatsAppChannelOwnershipConflict } from './ownership';

/**
 * Envoltorio comun de las rutas del Channel Manager (Punto 8): sesion, errores
 * tipados y JSON. Ningun error de Meta se reenvia crudo: puede repetir datos de
 * la cuenta o de la credencial.
 */
export async function channelRoute(
  run: (actor: ChannelActor) => Promise<unknown>,
  status = 200,
  /** Chequeo de rol en la propia ruta; el servicio lo vuelve a exigir. */
  authorize?: (role: WorkspaceRole) => boolean,
) {
  const user = await requireCurrentUser();
  if (authorize && !authorize(user.role)) {
    return NextResponse.json({ message: 'Solo el owner o un admin puede administrar los números de WhatsApp.', code: 'FORBIDDEN' }, { status: 403 });
  }
  try {
    const data = await run({ id: user.id, role: user.role, workspaceId: user.workspace.id });
    return NextResponse.json({ data }, { status });
  } catch (error) {
    return channelErrorResponse(error);
  }
}

export function channelErrorResponse(error: unknown) {
  if (error instanceof ChannelManagerError) return NextResponse.json({ message: error.message, code: error.code }, { status: error.status });
  if (error instanceof MetaWhatsAppError) return NextResponse.json({ message: error.message, code: error.code }, { status: error.httpStatus });
  if (error instanceof EntitlementError) return entitlementResponse(error);
  if (error instanceof EncryptionKeyMissingError) return NextResponse.json({ message: error.message }, { status: 503 });
  if (error instanceof ChannelOutboundError) return NextResponse.json({ message: error.message }, { status: 409 });
  if (isWhatsAppChannelOwnershipConflict(error)) {
    return NextResponse.json({ message: 'Ese número ya está conectado a otra cuenta.', code: 'CHANNEL_TAKEN' }, { status: 409 });
  }
  throw error;
}
