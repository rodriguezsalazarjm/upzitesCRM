import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ContactStatus } from '../../../../generated/prisma/client';
import { getContacts, getCurrentWorkspaceId } from '@/lib/crm-data';
import { prisma } from '@/lib/prisma';

const statusMap = {
  lead: ContactStatus.LEAD,
  activo: ContactStatus.ACTIVE,
  cliente: ContactStatus.CUSTOMER,
  inactivo: ContactStatus.INACTIVE,
} as const;

const contactSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  status: z.enum(['lead', 'activo', 'cliente', 'inactivo']).default('lead'),
  source: z.string().optional(),
  value: z.number().int().nonnegative().default(0),
  tags: z.array(z.string()).default([]),
});

export async function GET() {
  const contacts = await getContacts();
  return NextResponse.json({ data: contacts });
}

export async function POST(request: Request) {
  const input = contactSchema.parse(await request.json());
  const workspaceId = await getCurrentWorkspaceId();
  const company = input.company
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

  const contact = await prisma.contact.create({
    data: {
      workspaceId,
      companyId: company?.id,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      status: statusMap[input.status],
      source: input.source,
      value: input.value,
      tags: input.tags,
      lastActivityAt: new Date(),
    },
  });

  return NextResponse.json({ data: contact }, { status: 201 });
}

