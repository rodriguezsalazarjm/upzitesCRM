/**
 * Capa de dominio comercial (Fase 1).
 *
 * Reglas de uso:
 *   - Ninguna ruta ni agente escribe estados comerciales con `prisma.update`
 *     directo: todo pasa por estos servicios, que validan y auditan.
 *   - `canContact` es la unica puerta antes de cualquier envio promocional.
 *   - `applyApprovedPayment` solo se invoca desde un webhook ya verificado.
 */
export { recordAudit, type Db, type AuditInput } from './audit';

export {
  canTransition,
  transitionLifecycle,
  applyApprovedPayment,
  isCustomerReason,
  LifecycleTransitionError,
  CUSTOMER_REASONS,
  type TransitionInput,
  type TransitionReason,
  type ApprovedPaymentInput,
} from './lifecycle';

export {
  canContact,
  grantConsent,
  revokeConsent,
  suppressIdentifier,
  normalizeIdentifier,
  type ConsentDecision,
  type GrantInput,
  type RevokeInput,
  type SuppressInput,
} from './consent';

export {
  scheduleAction,
  cancelByKey,
  cancelForContact,
  dueActions,
  nextValidRunAt,
  isWithinQuietHours,
  DEFAULT_QUIET_HOURS,
  type QuietHours,
  type ScheduleInput,
} from './scheduled-actions';

export {
  computeScore,
  recalculateContactScore,
  ensureDefaultScoreRules,
  temperatureForScore,
  DEFAULT_SCORE_RULES,
  type ScoreResult,
  type ScoreReason,
  type ScoringSignals,
} from './scoring';
