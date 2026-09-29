import { NextResponse } from 'next/server';
import { EntitlementError } from '../entitlements';
import { entitlementResponse } from '../entitlements/http';
import { InvitationError } from '../invitations';
import { TeamError } from './service';

/** Errores de gestion de equipo → HTTP. Lo desconocido se relanza. */
export async function handleTeam(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    const json = (status: number, code: string, message: string) => NextResponse.json({ code, message }, { status });
    if (error instanceof EntitlementError) return entitlementResponse(error);
    if (error instanceof TeamError) {
      const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : error.code === 'LAST_OWNER' ? 409 : 400;
      return json(status, error.code, error.message);
    }
    if (error instanceof InvitationError) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'INVALID_INPUT' ? 400 : 409;
      return json(status, error.code, error.message);
    }
    throw error;
  }
}
