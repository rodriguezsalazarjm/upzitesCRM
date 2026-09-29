import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BillingInterval, PlanCode, PlatformRole } from '../../../../../generated/prisma/enums';
import { parseBody } from '@/lib/http';
import { publishPlanPrice } from '@/lib/billing/price-book';
import { platformGuard } from '@/lib/platform/access';

export const dynamic = 'force-dynamic';

const schema = z.object({
  planCode: z.nativeEnum(PlanCode),
  currency: z.string().trim().length(3),
  interval: z.nativeEnum(BillingInterval).default(BillingInterval.MONTH),
  amountMinor: z.number().int().nonnegative(),
  validFrom: z.string().optional(),
});

/**
 * Publica una version nueva del Price Book (solo SUPER_ADMIN). Nunca edita un
 * precio historico: cierra la version vigente y crea otra.
 */
export async function POST(request: Request) {
  const guard = await platformGuard(PlatformRole.SUPER_ADMIN);
  if (!guard.ok) return guard.response;
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;
  const price = await publishPlanPrice({
    ...input,
    validFrom: input.validFrom ? new Date(input.validFrom) : undefined,
    actorId: guard.actor.id,
  });
  return NextResponse.json({ data: price }, { status: 201 });
}
