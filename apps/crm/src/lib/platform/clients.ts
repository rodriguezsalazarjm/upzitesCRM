import { BillingSource, BusinessType, CommerceSubtype, MembershipStatus, PlanCode, WorkspaceRole } from '../../../generated/prisma/enums';
import { normalizeBusinessInput } from '../workspace-profile/business';
import { crossTenantPrisma } from '../prisma';
import { ensurePlanCatalog } from '../billing/plan-catalog';
import { getCurrentPrice } from '../billing/price-book';
import { activateManualSubscription, assignCompSubscription, startTrial } from '../billing/subscription-admin';
import { resolveLifecycle } from '../billing/subscription-state';
import { bootstrapMarketing } from '../marketing/bootstrap';
import { normalizeEmail } from '../identity';
import { createInvitation } from '../invitations';
import { provisionWorkspaceTx, uniqueWorkspaceSlug } from '../subscription';
import { assertSuperAdmin, type PlatformActor } from './access';

/**
 * Alta de clientes SaaS y de negocios internos desde Platform Admin (P0-D).
 *
 * Crea workspace + perfil minimo + suscripcion + invitacion al OWNER. NUNCA
 * crea una contrasena: el OWNER la elige al aceptar la invitacion (o, si ya
 * tiene cuenta, solo se le agrega la membership).
 *
 * Idempotente por `idempotencyKey` (un valor por envio del formulario): un
 * doble submit devuelve el mismo workspace y no duplica pagos. Los pasos de
 * billing reusan las operaciones de P0-B con claves derivadas.
 */

export type ClientBillingSource = 'FREE' | 'MANUAL' | 'COMP' | 'TRIAL';

export type CreateClientInput = {
  actor: PlatformActor;
  idempotencyKey: string;
  workspaceName: string;
  ownerName: string;
  ownerEmail: string;
  planCode: PlanCode;
  billingSource: ClientBillingSource;
  currency?: string;
  /** Meses del periodo pagado (MANUAL). */
  periodMonths?: number;
  /** Dias de prueba (TRIAL). */
  trialDays?: number;
  /** MANUAL: el pago ya se recibio (transferencia/factura). */
  payment?: { amountMinor?: number; paidAt?: Date; reference?: string | null; notes?: string | null } | null;
  /** Negocio propio (solo SUPER_ADMIN). Excluido de metricas SaaS. */
  isInternal?: boolean;
  /** Negocio propio: el SUPER_ADMIN queda como OWNER (auditado). */
  addActorAsOwner?: boolean;
  /**
   * P0-E: tipo de negocio inicial, SOLO al aprovisionar un negocio interno
   * (SUPER_ADMIN). Es provisioning, no edicion de datos del tenant: despues el
   * perfil se cambia dentro del workspace. El preset queda deducido y el
   * onboarding pendiente.
   */
  initialBusiness?: { businessType: BusinessType; commerceSubtype?: CommerceSubtype | null } | null;
  reason?: string | null;
};

export class PlatformClientError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'NO_PRICE',
    message: string,
  ) {
    super(message);
    this.name = 'PlatformClientError';
  }
}

const MONTH_MS = 30 * 86_400_000;

export async function createPlatformClient(input: CreateClientInput) {
  const ownerEmail = normalizeEmail(input.ownerEmail);
  const name = input.workspaceName.trim();
  if (name.length < 2) throw new PlatformClientError('INVALID_INPUT', 'Indica el nombre del negocio.');
  if (!input.idempotencyKey?.trim()) throw new PlatformClientError('INVALID_INPUT', 'Falta la clave de idempotencia.');
  if (input.billingSource === 'COMP') assertSuperAdmin(input.actor, 'asignar COMP');
  if (input.isInternal) assertSuperAdmin(input.actor, 'crear un negocio interno');
  if (input.initialBusiness && !input.isInternal) {
    throw new PlatformClientError('INVALID_INPUT', 'El tipo de negocio inicial solo se elige al crear un negocio interno.');
  }
  if (input.addActorAsOwner && !input.isInternal) {
    throw new PlatformClientError('INVALID_INPUT', 'Solo un negocio interno puede tener al operador como OWNER automatico.');
  }
  const selfOwned = Boolean(input.addActorAsOwner);
  if (!selfOwned && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) throw new PlatformClientError('INVALID_INPUT', 'Email del OWNER invalido.');
  if (input.planCode === PlanCode.FREE && input.billingSource !== 'FREE') {
    throw new PlatformClientError('INVALID_INPUT', 'FREE no lleva medio de pago.');
  }
  if (input.billingSource === 'FREE' && input.planCode !== PlanCode.FREE) {
    throw new PlatformClientError('INVALID_INPUT', 'Un plan pagado necesita MANUAL, COMP o TRIAL.');
  }
  if (input.billingSource === 'MANUAL' && !input.payment) {
    throw new PlatformClientError('INVALID_INPUT', 'MANUAL requiere el pago recibido. Si aun no pago, crea el cliente en FREE y registra la transferencia al recibirla.');
  }
  const currency = (input.currency ?? 'CLP').toUpperCase();
  if (input.billingSource === 'MANUAL' && !(await getCurrentPrice({ planCode: input.planCode, currency }))) {
    throw new PlatformClientError('NO_PRICE', `No hay precio vigente para ${input.planCode} en ${currency}.`);
  }

  const key = input.idempotencyKey.trim();
  const plans = await ensurePlanCatalog();
  const slug = await uniqueWorkspaceSlug(name);

  // Paso 1 (transaccion, idempotente por clave): workspace y, si corresponde,
  // la membership OWNER del operador.
  const { workspaceId, created } = await crossTenantPrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`platform_client:${key}`}, 0))`;
    const previous = await tx.platformAuditLog.findFirst({
      where: { action: 'platform.client_created', metadata: { path: ['idempotencyKey'], equals: key } },
      select: { targetWorkspaceId: true },
    });
    if (previous?.targetWorkspaceId) return { workspaceId: previous.targetWorkspaceId, created: false };

    const workspace = await provisionWorkspaceTx(tx, { name, slug, isInternal: Boolean(input.isInternal), freePlanId: plans[PlanCode.FREE].id });
    if (input.initialBusiness) {
      const business = normalizeBusinessInput({ businessType: input.initialBusiness.businessType, commerceSubtype: input.initialBusiness.commerceSubtype ?? null });
      await tx.workspaceProfile.upsert({
        where: { workspaceId: workspace.id },
        create: { workspaceId: workspace.id, ...business },
        update: business,
      });
    }
    if (selfOwned) {
      await tx.workspaceMembership.create({
        data: { userId: input.actor.id, workspaceId: workspace.id, role: WorkspaceRole.OWNER, invitedById: input.actor.id },
      });
      await tx.platformAuditLog.create({
        data: {
          actorUserId: input.actor.id,
          action: 'platform.internal_owner_membership',
          targetWorkspaceId: workspace.id,
          targetUserId: input.actor.id,
          metadata: { reason: input.reason ?? null },
        },
      });
    }
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorId: input.actor.id,
        action: 'customer.created_by_platform',
        entity: 'Workspace',
        entityId: workspace.id,
        metadata: { planCode: input.planCode, billingSource: input.billingSource, isInternal: Boolean(input.isInternal) },
      },
    });
    await tx.platformAuditLog.create({
      data: {
        actorUserId: input.actor.id,
        action: 'platform.client_created',
        targetWorkspaceId: workspace.id,
        metadata: {
          idempotencyKey: key,
          name,
          ownerEmail: selfOwned ? input.actor.email : ownerEmail,
          planCode: input.planCode,
          billingSource: input.billingSource,
          currency,
          isInternal: Boolean(input.isInternal),
          selfOwned,
          reason: input.reason ?? null,
        },
      },
    });
    return { workspaceId: workspace.id, created: true };
  });

  // Perfil minimo, politica de contacto y journeys de fabrica (idempotente).
  await bootstrapMarketing(workspaceId);

  // Paso 2: billing con las operaciones de P0-B (idempotentes).
  const actor = { actorId: input.actor.id, via: 'platform' as const, reason: input.reason ?? null };
  if (input.billingSource === 'MANUAL' && input.payment) {
    const paidAt = input.payment.paidAt ?? new Date();
    const months = Math.max(1, input.periodMonths ?? 1);
    await activateManualSubscription({
      workspaceId,
      planCode: input.planCode,
      currency,
      amountMinor: input.payment.amountMinor,
      paidAt,
      periodStart: paidAt,
      periodEnd: months === 1 ? undefined : new Date(paidAt.getTime() + months * MONTH_MS),
      reference: input.payment.reference ?? null,
      notes: input.payment.notes ?? null,
      idempotencyKey: `platform_client:${key}:payment`,
      ...actor,
    });
  } else if (input.billingSource === 'COMP') {
    if (created) await assignCompSubscription({ workspaceId, planCode: input.planCode, ...actor, reason: input.reason?.trim() || 'Alta desde Platform Admin' });
  } else if (input.billingSource === 'TRIAL') {
    if (created) await startTrial({ workspaceId, planCode: input.planCode, days: Math.max(1, input.trialDays ?? 14), ...actor });
  }

  // Paso 3: invitacion al OWNER (sin contrasena). Un reintento regenera el
  // token: el enlace anterior deja de servir.
  let invitation: Awaited<ReturnType<typeof createInvitation>> | null = null;
  if (!selfOwned) {
    const hasOwner = await crossTenantPrisma.workspaceMembership.count({
      where: { workspaceId, role: WorkspaceRole.OWNER, status: MembershipStatus.ACTIVE },
    });
    if (hasOwner === 0) {
      invitation = await createInvitation({ workspaceId, email: ownerEmail, role: WorkspaceRole.OWNER, actorId: input.actor.id, via: 'platform' });
    }
  }
  return { workspaceId, created, invitation };
}

// --- Consultas de plataforma (cross-tenant por diseno) -------------------------

/** Datos de plataforma de un workspace. NO incluye contactos ni conversaciones. */
export async function listPlatformWorkspaces(filter: { internal?: boolean; query?: string } = {}) {
  const rows = await crossTenantPrisma.workspace.findMany({
    where: {
      ...(filter.internal === undefined ? {} : { isInternal: filter.internal }),
      ...(filter.query?.trim() ? { name: { contains: filter.query.trim(), mode: 'insensitive' as const } } : {}),
    },
    select: {
      id: true,
      name: true,
      slug: true,
      isInternal: true,
      createdAt: true,
      subscription: { include: { plan: true, price: { select: { interval: true } } } },
      memberships: {
        where: { role: WorkspaceRole.OWNER, status: MembershipStatus.ACTIVE },
        select: { user: { select: { name: true, email: true } } },
        take: 1,
      },
      _count: { select: { memberships: { where: { status: MembershipStatus.ACTIVE } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    isInternal: row.isInternal,
    createdAt: row.createdAt,
    owner: row.memberships[0]?.user ?? null,
    members: row._count.memberships,
    subscription: resolveLifecycle(row.subscription ?? null),
  }));
}

export async function getPlatformWorkspace(workspaceId: string) {
  const workspace = await crossTenantPrisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true,
      name: true,
      slug: true,
      isInternal: true,
      createdAt: true,
      // P0-E: solo lectura. El perfil se configura dentro del workspace (o via SupportSession).
      profile: { select: { businessType: true, commerceSubtype: true, presetKey: true, presetVersion: true, onboardingCompletedAt: true } },
      subscription: { include: { plan: true, price: { select: { interval: true } } } },
      memberships: {
        select: { id: true, role: true, status: true, planLimitedAt: true, createdAt: true, user: { select: { id: true, name: true, email: true } } },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      },
      invitations: {
        select: { id: true, email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, lastSentAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 30,
      },
      subscriptionPayments: {
        select: { id: true, planCode: true, source: true, currency: true, amountMinor: true, paidAt: true, periodStart: true, periodEnd: true, reference: true, notes: true },
        orderBy: { paidAt: 'desc' },
        take: 30,
      },
    },
  });
  if (!workspace) return null;
  const audit = await crossTenantPrisma.platformAuditLog.findMany({
    where: { targetWorkspaceId: workspaceId },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  return { ...workspace, lifecycle: resolveLifecycle(workspace.subscription ?? null), audit };
}

/** Negocios internos donde el operador tiene membership ("Mis negocios"). */
export async function listMyBusinesses(userId: string) {
  return crossTenantPrisma.workspaceMembership.findMany({
    where: { userId, status: MembershipStatus.ACTIVE, workspace: { isInternal: true } },
    select: { role: true, workspace: { select: { id: true, name: true, subscription: { include: { plan: true } } } } },
    orderBy: { createdAt: 'asc' },
  });
}

/** Pagos SaaS recientes. Nunca incluye commerce (Payment/CustomerOrder) ni internos. */
export function listSaasPayments(input: { take?: number; includeInternal?: boolean } = {}) {
  return crossTenantPrisma.subscriptionPayment.findMany({
    where: input.includeInternal ? {} : { workspace: { isInternal: false } },
    select: {
      id: true,
      planCode: true,
      source: true,
      currency: true,
      amountMinor: true,
      paidAt: true,
      reference: true,
      priceId: true,
      price: { select: { amountMinor: true } },
      workspace: { select: { id: true, name: true, isInternal: true } },
    },
    orderBy: { paidAt: 'desc' },
    take: input.take ?? 50,
  });
}

export function listPendingInvitations() {
  return crossTenantPrisma.workspaceInvitation.findMany({
    where: { acceptedAt: null, revokedAt: null },
    select: { id: true, email: true, role: true, expiresAt: true, lastSentAt: true, createdAt: true, workspace: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}

export function listPlatformAudit(take = 200) {
  return crossTenantPrisma.platformAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take });
}

export function listPriceHistory() {
  return crossTenantPrisma.planPrice.findMany({
    orderBy: [{ planCode: 'asc' }, { currency: 'asc' }, { interval: 'asc' }, { validFrom: 'desc' }],
  });
}

export { BillingSource };
