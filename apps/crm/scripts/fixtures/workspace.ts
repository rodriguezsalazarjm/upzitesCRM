import { ActivationStatus, BillingSource, SubscriptionStatus } from '../../generated/prisma/client';
import { prisma } from '../../src/lib/prisma';
import { ensureMonthlyPlan, nextTrialEnd } from '../../src/lib/subscription';

/**
 * Activa un workspace de prueba saltandose el wizard.
 *
 * Desde la Fase 9 un workspace nace en ONBOARDING y ni el agente ni los
 * journeys escriben hasta que se activa. Las suites anteriores a esa fase
 * prueban otra cosa —los agentes, la recuperacion— y no tiene sentido que cada
 * una monte un onboarding completo para llegar a lo suyo.
 *
 * Se escribe el estado directamente, sin pasar por `activateWorkspace`, a
 * proposito: la puerta de activacion se prueba en la suite de la Fase 9, con
 * sus requisitos de verdad. Aqui solo se necesita el efecto.
 *
 * P0-B: el registro ahora nace en FREE (sin capacidades pagadas). Las suites
 * anteriores prueban funciones que necesitan un plan con capacidades, asi que
 * se les deja el mismo punto de partida que tenian (ver `legacyTrialForTests`).
 */
export async function activateForTests(workspaceId: string) {
  await legacyTrialForTests(workspaceId);
  await prisma.workspaceActivation.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      status: ActivationStatus.ACTIVE,
      activatedAt: new Date(),
      note: 'Activado por la suite de pruebas.',
    },
    update: { status: ActivationStatus.ACTIVE, activatedAt: new Date() },
  });
}

/**
 * Deja la suscripcion como la creaba el alta ANTES de P0-B: plan legacy
 * `monthly` en TRIAL de 7 dias, escrita solo con las columnas legacy
 * (`status`, `trialEndsAt`, `renewsAt`) y sin columnas V2.
 *
 * Es a proposito: las suites que manipulan esas columnas (vencer, gracia,
 * pasar a ACTIVE) siguen funcionando, y ejercitan la ruta de compatibilidad
 * del resolver unico con filas escritas por codigo anterior.
 */
export async function legacyTrialForTests(workspaceId: string) {
  const plan = await ensureMonthlyPlan();
  const data = {
    planId: plan.id,
    status: SubscriptionStatus.TRIAL,
    trialEndsAt: nextTrialEnd(),
    renewsAt: null,
    billingSource: BillingSource.FREE,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    priceId: null,
    currency: null,
    amountMinor: null,
  };
  await prisma.workspaceSubscription.upsert({
    where: { workspaceId },
    create: { workspaceId, ...data },
    update: data,
  });
}
