import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PricingRuleSetStatus } from '../../../../generated/prisma/client';
import { requireCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/domain/audit';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { canApproveQuotes } from '@/lib/quotes/service';
import { intakeSchemaSchema, rulesSchema } from '@/lib/quotes/schema';

export const dynamic = 'force-dynamic';

const createSchema = z
  .object({
    serviceKey: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z][a-z0-9-]*$/, 'Usa minúsculas y guiones'),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).optional(),
    currency: z.string().length(3).default('CLP'),
    intakeSchema: intakeSchemaSchema,
    rules: rulesSchema,
    disclaimer: z.string().trim().max(500).optional(),
    validityDays: z.number().int().min(1).max(365).default(15),
  })
  .strict();

export async function GET() {
  const user = await requireCurrentUser();

  const sets = await prisma.pricingRuleSet.findMany({
    where: { workspaceId: user.workspace.id },
    orderBy: [{ serviceKey: 'asc' }, { version: 'desc' }],
  });

  return NextResponse.json({ data: sets });
}

/**
 * Crea una version nueva de reglas, siempre en borrador.
 *
 * No modifica la publicada: cambiar precios es una decision que se publica
 * aparte, para que una edicion a medias no afecte cotizaciones en curso.
 */
export async function POST(request: Request) {
  const user = await requireCurrentUser();

  if (!canApproveQuotes(user.role)) {
    return NextResponse.json(
      { message: 'Solo el owner o un admin puede editar reglas de precio.' },
      { status: 403 },
    );
  }

  const parsed = await parseBody(request, createSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;

  const ruleSet = await prisma.$transaction(async (tx) => {
    const last = await tx.pricingRuleSet.findFirst({
      where: { workspaceId: user.workspace.id, serviceKey: input.serviceKey },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const saved = await tx.pricingRuleSet.create({
      data: {
        workspaceId: user.workspace.id,
        serviceKey: input.serviceKey,
        name: input.name,
        description: input.description,
        currency: input.currency.toUpperCase(),
        version: (last?.version ?? 0) + 1,
        intakeSchema: input.intakeSchema as never,
        rules: input.rules as never,
        disclaimer: input.disclaimer,
        validityDays: input.validityDays,
        status: PricingRuleSetStatus.DRAFT,
        createdById: user.id,
      },
    });

    await recordAudit(
      {
        workspaceId: user.workspace.id,
        actorId: user.id,
        action: 'pricing.rule_set_created',
        entity: 'PricingRuleSet',
        entityId: saved.id,
        metadata: { serviceKey: saved.serviceKey, version: saved.version },
      },
      tx,
    );

    return saved;
  });

  return NextResponse.json({ data: ruleSet }, { status: 201 });
}
