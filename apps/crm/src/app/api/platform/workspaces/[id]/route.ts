import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PlanCode } from '../../../../../../generated/prisma/enums';
import { parseBody } from '@/lib/http';
import {
  activateManualSubscription,
  assignCompSubscription,
  assignPlan,
  renewManualSubscription,
  resumeSubscription,
  setWorkspaceInternal,
  suspendSubscription,
} from '@/lib/billing/subscription-admin';
import { assertSuperAdmin, platformGuard } from '@/lib/platform/access';
import { handlePlatform } from '@/lib/platform/http';

export const dynamic = 'force-dynamic';

const reason = z.string().trim().max(500).optional();
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('change_plan'), planCode: z.nativeEnum(PlanCode), currency: z.string().length(3).optional(), reason }),
  z.object({
    action: z.literal('manual_payment'),
    idempotencyKey: z.string().min(8).max(100),
    planCode: z.nativeEnum(PlanCode),
    currency: z.string().length(3).default('CLP'),
    amountMinor: z.number().int().nonnegative().optional(),
    paidAt: z.string().optional(),
    periodStart: z.string().optional(),
    periodEnd: z.string().optional(),
    reference: z.string().max(200).optional(),
    notes: z.string().max(1000).optional(),
    reason,
  }),
  z.object({
    action: z.literal('renew'),
    idempotencyKey: z.string().min(8).max(100),
    currency: z.string().length(3).optional(),
    amountMinor: z.number().int().nonnegative().optional(),
    paidAt: z.string().optional(),
    periods: z.number().int().min(1).max(24).optional(),
    reference: z.string().max(200).optional(),
    notes: z.string().max(1000).optional(),
    reason,
  }),
  z.object({ action: z.literal('comp'), planCode: z.nativeEnum(PlanCode), periodEnd: z.string().optional(), reason: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal('suspend'), reason: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal('resume'), reason }),
  z.object({ action: z.literal('set_internal'), isInternal: z.boolean(), reason: z.string().trim().min(3).max(500) }),
]);

const date = (value?: string) => (value ? new Date(value) : undefined);

/** Acciones de billing y estado sobre un workspace (reusa las operaciones de P0-B). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await platformGuard();
  if (!guard.ok) return guard.response;
  const { id: workspaceId } = await params;
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;
  const actor = { actorId: guard.actor.id, via: 'platform' as const, reason: input.reason ?? null };

  return handlePlatform(async () => {
    switch (input.action) {
      case 'change_plan':
        return NextResponse.json({ data: await assignPlan({ workspaceId, planCode: input.planCode, currency: input.currency, ...actor }) });
      case 'manual_payment':
        return NextResponse.json({
          data: await activateManualSubscription({
            workspaceId,
            planCode: input.planCode,
            currency: input.currency,
            amountMinor: input.amountMinor,
            paidAt: date(input.paidAt),
            periodStart: date(input.periodStart),
            periodEnd: date(input.periodEnd),
            reference: input.reference ?? null,
            notes: input.notes ?? null,
            idempotencyKey: input.idempotencyKey,
            ...actor,
          }),
        });
      case 'renew':
        return NextResponse.json({
          data: await renewManualSubscription({
            workspaceId,
            currency: input.currency,
            amountMinor: input.amountMinor,
            paidAt: date(input.paidAt),
            periods: input.periods,
            reference: input.reference ?? null,
            notes: input.notes ?? null,
            idempotencyKey: input.idempotencyKey,
            ...actor,
          }),
        });
      case 'comp':
        assertSuperAdmin(guard.actor, 'asignar COMP');
        return NextResponse.json({
          data: await assignCompSubscription({ workspaceId, planCode: input.planCode, periodEnd: date(input.periodEnd) ?? null, ...actor }),
        });
      case 'suspend':
        return NextResponse.json({ data: await suspendSubscription({ workspaceId, ...actor }) });
      case 'resume':
        return NextResponse.json({ data: await resumeSubscription({ workspaceId, ...actor }) });
      case 'set_internal':
        assertSuperAdmin(guard.actor, 'marcar un workspace como interno');
        await setWorkspaceInternal({ workspaceId, isInternal: input.isInternal, ...actor });
        return NextResponse.json({ data: { isInternal: input.isInternal } });
    }
  });
}
