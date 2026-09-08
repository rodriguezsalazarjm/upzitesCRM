import { BuyingIntent, LeadTemperature, LifecycleStatus } from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { recordAudit, type Db } from './audit';

/**
 * Reglas iniciales de scoring (spec, seccion 10).
 *
 * Solo se incluyen las que hoy son calculables con los datos que el CRM ya
 * tiene. Las que dependen de canales aun no implementados quedan registradas
 * como inactivas para no inventar señales:
 *   - apertura y clic de email  -> Fase 8
 *   - apertura de checkout real -> Fase 5 (hoy se infiere de BuyingIntent)
 *   - medidas o direccion       -> Fase 7 (cotizador)
 */
export const DEFAULT_SCORE_RULES = [
  { key: 'asked_price', label: 'Pidio precio', points: 20 },
  { key: 'requested_quote', label: 'Solicito cotizacion', points: 25 },
  { key: 'started_checkout', label: 'Abrio checkout', points: 30 },
  { key: 'replied_24h', label: 'Respondio en las ultimas 24 horas', points: 15 },
  { key: 'has_open_opportunity', label: 'Tiene oportunidad abierta', points: 15 },
  { key: 'engaged_activities', label: 'Actividades registradas', points: 10 },
  { key: 'stale_7d', label: 'Siete dias sin actividad', points: -15 },
  { key: 'stale_30d', label: 'Treinta dias sin actividad', points: -30 },
  { key: 'not_interested', label: 'Indico que no esta interesado', points: -50 },
] as const;

export type ScoreReason = { key: string; label: string; points: number };

export type ScoreResult = {
  score: number;
  temperature: LeadTemperature;
  reasons: ScoreReason[];
};

/** Umbrales por defecto: HOT 70-100, WARM 40-69, COLD 0-39. */
export function temperatureForScore(score: number): LeadTemperature {
  if (score >= 70) return LeadTemperature.HOT;
  if (score >= 40) return LeadTemperature.WARM;
  return LeadTemperature.COLD;
}

export type ScoringSignals = {
  buyingIntent: BuyingIntent;
  lifecycleStatus: LifecycleStatus;
  lastActivityAt: Date | null;
  activityCount: number;
  openOpportunities: number;
};

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Calcula score y temperatura de forma determinista y explicable.
 *
 * Es una funcion pura: recibe señales ya leidas y devuelve el desglose. El
 * resultado se guarda en LeadScoreSnapshot con sus razones, para poder
 * responder "por que este lead esta caliente" sin recalcular nada.
 */
export function computeScore(
  signals: ScoringSignals,
  rules: readonly { key: string; label: string; points: number }[] = DEFAULT_SCORE_RULES,
): ScoreResult {
  const byKey = new Map(rules.map((rule) => [rule.key, rule]));
  const reasons: ScoreReason[] = [];

  const add = (key: string) => {
    const rule = byKey.get(key);
    if (rule) reasons.push({ key: rule.key, label: rule.label, points: rule.points });
  };

  switch (signals.buyingIntent) {
    case BuyingIntent.INTERESTED:
      add('asked_price');
      break;
    case BuyingIntent.QUOTE_REQUESTED:
      add('requested_quote');
      break;
    case BuyingIntent.CHECKOUT_STARTED:
      add('started_checkout');
      break;
    case BuyingIntent.NO_INTENT:
      add('not_interested');
      break;
    default:
      break;
  }

  if (signals.openOpportunities > 0) add('has_open_opportunity');
  if (signals.activityCount >= 3) add('engaged_activities');

  const idleMs = signals.lastActivityAt ? Date.now() - signals.lastActivityAt.getTime() : null;

  if (idleMs !== null && idleMs <= DAY_MS) {
    add('replied_24h');
  } else if (idleMs !== null && idleMs > 30 * DAY_MS) {
    add('stale_30d');
  } else if (idleMs !== null && idleMs > 7 * DAY_MS) {
    add('stale_7d');
  }

  const raw = reasons.reduce((sum, reason) => sum + reason.points, 0);
  const score = Math.max(0, Math.min(100, raw));

  return { score, temperature: temperatureForScore(score), reasons };
}

/**
 * Recalcula el score de un contacto leyendo sus señales actuales, actualiza el
 * contacto y guarda un snapshot con las razones.
 */
export async function recalculateContactScore(
  input: { workspaceId: string; contactId: string; actorId?: string | null },
  db: Db = prisma,
) {
  const contact = await db.contact.findFirst({
    where: { id: input.contactId, workspaceId: input.workspaceId },
    select: {
      id: true,
      buyingIntent: true,
      lifecycleStatus: true,
      lastActivityAt: true,
      leadScore: true,
      _count: { select: { activities: true } },
    },
  });

  if (!contact) return null;

  const openOpportunities = await db.opportunity.count({
    where: { workspaceId: input.workspaceId, contactId: contact.id, status: 'OPEN' },
  });

  const rules = await db.leadScoreRule.findMany({
    where: { workspaceId: input.workspaceId, isActive: true },
    select: { key: true, label: true, points: true },
  });

  const result = computeScore(
    {
      buyingIntent: contact.buyingIntent,
      lifecycleStatus: contact.lifecycleStatus,
      lastActivityAt: contact.lastActivityAt,
      activityCount: contact._count.activities,
      openOpportunities,
    },
    rules.length > 0 ? rules : DEFAULT_SCORE_RULES,
  );

  await db.contact.update({
    where: { id: contact.id },
    data: {
      leadScore: result.score,
      temperature: result.temperature,
      scoreUpdatedAt: new Date(),
    },
  });

  await db.leadScoreSnapshot.create({
    data: {
      workspaceId: input.workspaceId,
      contactId: contact.id,
      score: result.score,
      temperature: result.temperature,
      reasons: result.reasons,
    },
  });

  if (contact.leadScore !== result.score) {
    await recordAudit(
      {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: 'contact.score_recalculated',
        entity: 'Contact',
        entityId: contact.id,
        metadata: { from: contact.leadScore, to: result.score, temperature: result.temperature },
      },
      db,
    );
  }

  return result;
}

/** Crea las reglas por defecto de un workspace nuevo. Idempotente. */
export async function ensureDefaultScoreRules(workspaceId: string, db: Db = prisma) {
  await db.leadScoreRule.createMany({
    data: DEFAULT_SCORE_RULES.map((rule) => ({
      workspaceId,
      key: rule.key,
      label: rule.label,
      points: rule.points,
    })),
    skipDuplicates: true,
  });
}
