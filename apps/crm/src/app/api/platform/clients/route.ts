import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PlanCode } from '../../../../../generated/prisma/enums';
import { parseBody } from '@/lib/http';
import { sendInvitationEmail } from '@/lib/invitations';
import { platformGuard } from '@/lib/platform/access';
import { createPlatformClient } from '@/lib/platform/clients';
import { handlePlatform } from '@/lib/platform/http';

export const dynamic = 'force-dynamic';

const schema = z.object({
  idempotencyKey: z.string().min(8).max(100),
  workspaceName: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().max(120).default(''),
  ownerEmail: z.string().trim().max(200).default(''),
  planCode: z.nativeEnum(PlanCode),
  billingSource: z.enum(['FREE', 'MANUAL', 'COMP', 'TRIAL']),
  currency: z.string().trim().length(3).default('CLP'),
  periodMonths: z.number().int().min(1).max(24).optional(),
  trialDays: z.number().int().min(1).max(90).optional(),
  payment: z
    .object({
      amountMinor: z.number().int().nonnegative().optional(),
      paidAt: z.string().optional(),
      reference: z.string().max(200).optional(),
      notes: z.string().max(1000).optional(),
    })
    .nullable()
    .optional(),
  isInternal: z.boolean().default(false),
  addActorAsOwner: z.boolean().default(false),
  sendEmail: z.boolean().default(true),
  reason: z.string().max(500).optional(),
});

/** Nuevo cliente SaaS (o negocio interno, solo SUPER_ADMIN). */
export async function POST(request: Request) {
  const guard = await platformGuard();
  if (!guard.ok) return guard.response;
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  return handlePlatform(async () => {
    const result = await createPlatformClient({
      actor: guard.actor,
      ...input,
      // En el formulario, MANUAL significa "pago recibido": sin datos de pago
      // es hoy y por el monto del Price Book.
      payment:
        input.payment || input.billingSource === 'MANUAL'
          ? {
              amountMinor: input.payment?.amountMinor,
              paidAt: input.payment?.paidAt ? new Date(input.payment.paidAt) : undefined,
              reference: input.payment?.reference ?? null,
              notes: input.payment?.notes ?? null,
            }
          : null,
    });
    const email =
      result.invitation && input.sendEmail
        ? await sendInvitationEmail({
            invitationId: result.invitation.invitation.id,
            workspaceId: result.workspaceId,
            token: result.invitation.token,
          })
        : null;
    return NextResponse.json(
      {
        data: {
          workspaceId: result.workspaceId,
          created: result.created,
          // El enlace se muestra UNA vez: despues solo se puede regenerar.
          invitationUrl: result.invitation?.url ?? null,
          emailSent: email?.sent ?? false,
        },
      },
      { status: result.created ? 201 : 200 },
    );
  });
}
