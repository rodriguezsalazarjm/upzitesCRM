import { SubscriptionStatus } from '../../../generated/prisma/client';

/**
 * Estado de la suscripcion de un workspace: la UNICA respuesta a "este
 * workspace esta al dia?".
 *
 * Antes habia dos: la interfaz miraba `renewsAt`/`trialEndsAt` y los limites
 * daban por activo cualquier `ACTIVE`, aunque hubiera vencido hace meses. Con
 * la app bloqueada, el agente, los emails y las campanas seguian gastando en
 * segundo plano. Toda decision sobre acceso o consumo pasa por aqui.
 *
 * Este archivo es puro (sin base de datos) para poder probarlo sin conexion;
 * las consultas viven en `subscription-access.ts`.
 *
 *  - TRIAL:   prueba vigente.
 *  - ACTIVE:  pagado y vigente.
 *  - GRACE:   pagado, vencido hace menos de GRACE_PERIOD_DAYS. Conserva todo
 *             y se muestra aviso de renovacion.
 *  - EXPIRED: vencido (el trial no tiene gracia), cancelado o sin fechas.
 *  - NONE:    el workspace no tiene suscripcion.
 */
export const GRACE_PERIOD_DAYS = 7;

const DAY_MS = 1000 * 60 * 60 * 24;

export type SubscriptionState = 'TRIAL' | 'ACTIVE' | 'GRACE' | 'EXPIRED' | 'NONE';

export type SubscriptionSnapshot = {
  state: SubscriptionState;
  /** Puede usar la aplicacion. */
  hasAccess: boolean;
  /** Puede gastar recursos pagados: IA, mensajes, emails. */
  canConsume: boolean;
  /** Fin del periodo pagado o del trial. */
  expiresAt: Date | null;
  /** Solo en GRACE: cuando se corta el acceso. */
  graceEndsAt: Date | null;
  /** Dias hasta que se pierde el acceso (fin de gracia si esta en GRACE). */
  daysLeft: number;
};

export type SubscriptionDates = {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  renewsAt: Date | null;
};

function daysUntil(date: Date, now: Date) {
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / DAY_MS));
}

function snapshot(
  state: SubscriptionState,
  expiresAt: Date | null,
  graceEndsAt: Date | null,
  now: Date,
): SubscriptionSnapshot {
  const allowed = state === 'TRIAL' || state === 'ACTIVE' || state === 'GRACE';
  const cutoff = graceEndsAt ?? expiresAt;
  return {
    state,
    hasAccess: allowed,
    canConsume: allowed,
    expiresAt,
    graceEndsAt,
    daysLeft: allowed && cutoff ? daysUntil(cutoff, now) : 0,
  };
}

export function resolveSubscriptionState(
  subscription: SubscriptionDates | null,
  now = new Date(),
): SubscriptionSnapshot {
  if (!subscription) return snapshot('NONE', null, null, now);

  if (subscription.status === SubscriptionStatus.TRIAL) {
    const expiresAt = subscription.trialEndsAt ?? subscription.renewsAt;
    // Sin fecha de fin no hay prueba: un trial sin techo seria acceso gratis
    // para siempre.
    if (expiresAt && expiresAt > now) return snapshot('TRIAL', expiresAt, null, now);
    return snapshot('EXPIRED', expiresAt, null, now);
  }

  if (
    subscription.status === SubscriptionStatus.ACTIVE ||
    subscription.status === SubscriptionStatus.PAST_DUE
  ) {
    const expiresAt = subscription.renewsAt;
    if (!expiresAt) return snapshot('EXPIRED', null, null, now);
    if (expiresAt > now) return snapshot('ACTIVE', expiresAt, null, now);

    const graceEndsAt = new Date(expiresAt.getTime() + GRACE_PERIOD_DAYS * DAY_MS);
    if (graceEndsAt > now) return snapshot('GRACE', expiresAt, graceEndsAt, now);
    return snapshot('EXPIRED', expiresAt, null, now);
  }

  // CANCELED u otro estado desconocido: se cierra por defecto.
  return snapshot('EXPIRED', subscription.renewsAt ?? subscription.trialEndsAt, null, now);
}
