import { NextResponse } from 'next/server';
import { EntitlementError } from './index';

/**
 * Respuesta HTTP de un bloqueo de plan. Mismo contrato en todos los endpoints:
 *  - 403 PLAN_FEATURE: la funcion no esta en el plan.
 *  - 409 PLAN_LIMIT: se alcanzo el limite (crear/conectar/publicar).
 *  - 423 WORKSPACE_SUSPENDED: bloqueo total.
 * `requiredPlan` alimenta el "Disponible en PRO" de la interfaz.
 */
export function entitlementResponse(error: EntitlementError) {
  const status = error.code === 'PLAN_FEATURE' ? 403 : error.code === 'PLAN_LIMIT' ? 409 : 423;
  return NextResponse.json(
    {
      message: error.message,
      code: error.code,
      key: error.details.key,
      limit: error.details.limit,
      usage: error.details.usage,
      requiredPlan: error.details.requiredPlan ?? null,
    },
    { status },
  );
}

/** Ejecuta un gate y devuelve la respuesta de bloqueo, o null si pasa. */
export async function gate(run: () => Promise<unknown>): Promise<NextResponse | null> {
  try {
    await run();
    return null;
  } catch (error) {
    if (error instanceof EntitlementError) return entitlementResponse(error);
    throw error;
  }
}
