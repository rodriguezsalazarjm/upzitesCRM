import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SubscriptionStatus } from '../../../../../generated/prisma/client';
import { getCurrentWorkspaceId } from '@/lib/crm-data';
import { prisma } from '@/lib/prisma';

const checkoutSchema = z.object({
  planKey: z.string().min(1),
});

export async function POST(request: Request) {
  const input = checkoutSchema.parse(await request.json());
  const workspaceId = await getCurrentWorkspaceId();
  const plan = await prisma.subscriptionPlan.findUniqueOrThrow({
    where: { key: input.planKey },
  });

  const subscription = await prisma.workspaceSubscription.create({
    data: {
      workspaceId,
      planId: plan.id,
      status: SubscriptionStatus.ACTIVE,
      renewsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
  });

  return NextResponse.json({
    data: subscription,
    checkoutUrl: `/billing?checkout=mock&plan=${plan.key}`,
  });
}
