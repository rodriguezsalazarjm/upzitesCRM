import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ContactStatus } from '../../../../generated/prisma/client';
import { getContacts, getCurrentWorkspaceId } from '@/lib/crm-data';
import { withEntitlementLock } from '@/lib/entitlements/lock';
import { gate } from '@/lib/entitlements/http';
import { parseBody } from '@/lib/http';
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
  const parsed = await parseBody(request, contactSchema);
  if (!parsed.ok) return parsed.response;
  const input = parsed.data;
  const workspaceId = await getCurrentWorkspaceId();

  // P0-C (D3): crear aumenta el uso y se bloquea en el limite. Ver, editar y
  // borrar siguen permitidos aunque un downgrade deje el uso por encima. El
  // chequeo y la insercion van bajo el lock de `contacts.max`.
  let contact!: Awaited<ReturnType<typeof prisma.contact.create>>;
  const blocked = await gate(() =>
    withEntitlementLock(workspaceId, 'contacts.max', async (tx, guard) => {
      await guard.assertCanGrow();
      const company = input.company
        ? await tx.company.upsert({
            where: { workspaceId_name: { workspaceId, name: input.company } },
            create: { workspaceId, name: input.company },
            update: {},
          })
        : null;
      contact = await tx.contact.create({
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
    }),
  );
  if (blocked) return blocked;

  return NextResponse.json({ data: contact }, { status: 201 });
}

