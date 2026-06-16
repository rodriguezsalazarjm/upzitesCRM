import { NextResponse } from 'next/server';
import { z } from 'zod';
import { IntegrationProvider, IntegrationStatus } from '../../../../generated/prisma/client';
import { getCurrentWorkspaceId } from '@/lib/crm-data';
import { getIntegrations } from '@/lib/ops-data';
import { prisma } from '@/lib/prisma';

const integrationSchema = z.object({
  provider: z.nativeEnum(IntegrationProvider),
  name: z.string().min(1),
  status: z.nativeEnum(IntegrationStatus).default(IntegrationStatus.CONNECTED),
  config: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export async function GET() {
  return NextResponse.json({ data: await getIntegrations() });
}

export async function POST(request: Request) {
  const input = integrationSchema.parse(await request.json());
  const workspaceId = await getCurrentWorkspaceId();
  const integration = await prisma.integration.upsert({
    where: {
      workspaceId_provider: {
        workspaceId,
        provider: input.provider,
      },
    },
    create: {
      workspaceId,
      provider: input.provider,
      name: input.name,
      status: input.status,
      config: input.config,
      lastSyncAt: new Date(),
    },
    update: {
      name: input.name,
      status: input.status,
      config: input.config,
      lastSyncAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      workspaceId,
      action: 'integration.upserted',
      entity: 'integration',
      entityId: integration.id,
      metadata: { provider: integration.provider, status: integration.status },
    },
  });

  return NextResponse.json({ data: integration });
}
