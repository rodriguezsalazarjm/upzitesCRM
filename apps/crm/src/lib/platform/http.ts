import { NextResponse } from 'next/server';
import { SubscriptionAdminError } from '../billing/subscription-admin';
import { EntitlementError } from '../entitlements';
import { entitlementResponse } from '../entitlements/http';
import { InvitationError } from '../invitations';
import { PlatformPermissionError } from './access';
import { PlatformClientError } from './clients';
import { PlatformRoleError } from './roles';

/** Errores conocidos de plataforma → respuesta HTTP. null = no es uno de ellos. */
export function platformErrorResponse(error: unknown): NextResponse | null {
  const json = (status: number, code: string, message: string) => NextResponse.json({ code, message }, { status });
  if (error instanceof EntitlementError) return entitlementResponse(error);
  if (error instanceof PlatformPermissionError) return json(403, 'SUPER_ADMIN_REQUIRED', error.message);
  if (error instanceof PlatformClientError) return json(error.code === 'NO_PRICE' ? 409 : 400, error.code, error.message);
  if (error instanceof PlatformRoleError) return json(error.code === 'NOT_FOUND' ? 404 : error.code === 'LAST_SUPER_ADMIN' ? 409 : 400, error.code, error.message);
  if (error instanceof SubscriptionAdminError) return json(error.code === 'NO_SUBSCRIPTION' ? 404 : 409, error.code, error.message);
  if (error instanceof InvitationError) {
    const status =
      error.code === 'NOT_FOUND' ? 404 : error.code === 'AUTH_REQUIRED' ? 401 : error.code === 'WRONG_ACCOUNT' ? 403 : error.code === 'INVALID_INPUT' ? 400 : 409;
    return json(status, error.code, error.message);
  }
  return null;
}

export async function handlePlatform(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    const response = platformErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
