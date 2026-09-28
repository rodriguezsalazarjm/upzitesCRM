import { NextResponse } from 'next/server';
import { ContactStatus } from '../../../../../generated/prisma/client';
import { getCurrentWorkspaceId } from '@/lib/crm-data';
import { splitName } from '@/lib/capture';
import { prisma } from '@/lib/prisma';
import { getWorkspaceEntitlements, isEntitlementError } from '@/lib/entitlements';
import { withEntitlementLock } from '@/lib/entitlements/lock';

const statusMap: Record<string, ContactStatus> = {
  lead: ContactStatus.LEAD,
  activo: ContactStatus.ACTIVE,
  cliente: ContactStatus.CUSTOMER,
  inactivo: ContactStatus.INACTIVE,
};

export async function POST(request: Request) {
  const workspaceId = await getCurrentWorkspaceId();
  const text = await request.text();
  const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);

  if (!headerLine) {
    return NextResponse.json({ imported: 0 });
  }

  const headers = parseCsvLine(headerLine).map((header) => header.trim().toLowerCase());
  let imported = 0;
  let skipped = 0;

  // P0-C (D3): importar crea contactos y se corta en el limite del plan.
  // Actualizar los que ya existen sigue permitido; solo se omiten los nuevos
  // que no caben (lo ya cargado no se pierde).
  const entitlements = await getWorkspaceEntitlements(workspaceId);
  if (entitlements.state === 'SUSPENDED') {
    return NextResponse.json({ message: 'El workspace esta suspendido.', code: 'WORKSPACE_SUSPENDED' }, { status: 423 });
  }

  for (const line of lines) {
    const values = parseCsvLine(line);
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    const email = row.email?.trim();
    const { firstName, lastName } = splitName(row.name);
    const companyName = row.company?.trim();
    const company = companyName
      ? await prisma.company.upsert({
          where: {
            workspaceId_name: {
              workspaceId,
              name: companyName,
            },
          },
          create: {
            workspaceId,
            name: companyName,
          },
          update: {},
        })
      : null;

    if (email) {
      const data = {
        companyId: company?.id,
        firstName,
        lastName,
        phone: row.phone || undefined,
        value: Number(row.value || 0),
        lastActivityAt: new Date(),
      };
      const exists = await prisma.contact.findUnique({
        where: { workspaceId_email: { workspaceId, email } },
        select: { id: true },
      });
      if (exists) {
        // Actualizar lo existente siempre se permite, aun sobre el limite.
        await prisma.contact.update({
          where: { id: exists.id },
          data: {
            ...data,
            status: statusMap[row.status] ?? undefined,
            source: row.source || undefined,
            tags: row.tags ? row.tags.split('|').map((tag) => tag.trim()).filter(Boolean) : undefined,
          },
        });
      } else {
        // Alta nueva: chequeo final + insercion bajo el lock de `contacts.max`.
        try {
          await withEntitlementLock(workspaceId, 'contacts.max', async (tx, guard) => {
            await guard.assertCanGrow();
            await tx.contact.upsert({
              where: { workspaceId_email: { workspaceId, email } },
              create: {
                workspaceId,
                email,
                ...data,
                status: statusMap[row.status] ?? ContactStatus.LEAD,
                source: row.source || 'Importacion CSV',
                tags: row.tags ? row.tags.split('|').map((tag) => tag.trim()).filter(Boolean) : ['importado'],
              },
              update: data,
            });
          });
        } catch (error) {
          if (isEntitlementError(error) && error.code === 'PLAN_LIMIT') {
            skipped += 1;
            continue;
          }
          throw error;
        }
      }
      imported += 1;
    }
  }

  if (skipped > 0) {
    return NextResponse.json(
      {
        imported,
        skipped,
        code: 'PLAN_LIMIT',
        message: `Se importaron ${imported}. ${skipped} contactos nuevos no caben en el limite de tu plan (${entitlements.limit('contacts.max')}).`,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ imported });
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === ',' && !quoted) {
      values.push(value);
      value = '';
      continue;
    }

    value += char;
  }

  values.push(value);
  return values;
}
