import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ContactStatus } from '../../../../../generated/prisma/client';
import { getCurrentWorkspaceId } from '@/lib/crm-data';
import { prisma } from '@/lib/prisma';

const statusMap = {
  lead: ContactStatus.LEAD,
  activo: ContactStatus.ACTIVE,
  cliente: ContactStatus.CUSTOMER,
  inactivo: ContactStatus.INACTIVE,
} as const;

const updateContactSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  status: z.enum(['lead', 'activo', 'cliente', 'inactivo']).optional(),
  source: z.string().nullable().optional(),
  value: z.number().int().nonnegative().optional(),
  tags: z.array(z.string()).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const input = updateContactSchema.parse(await request.json());
  const workspaceId = await getCurrentWorkspaceId();
  const company =
    input.company === undefined
      ? undefined
      : input.company
        ? await prisma.company.upsert({
            where: {
              workspaceId_name: {
                workspaceId,
                name: input.company,
              },
            },
            create: {
              workspaceId,
              name: input.company,
            },
            update: {},
          })
        : null;

  const contact = await prisma.contact.update({
    where: { id, workspaceId },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      companyId: company === undefined ? undefined : company?.id ?? null,
      status: input.status ? statusMap[input.status] : undefined,
      source: input.source,
      value: input.value,
      tags: input.tags,
    },
  });

  return NextResponse.json({ data: contact });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspaceId = await getCurrentWorkspaceId();

  await prisma.contact.delete({
    where: { id, workspaceId },
  });

  return NextResponse.json({ ok: true });
}

