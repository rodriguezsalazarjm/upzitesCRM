import { NextResponse } from 'next/server';
import { ContactStatus } from '../../../../../generated/prisma/client';
import { getCurrentWorkspaceId } from '@/lib/crm-data';
import { splitName } from '@/lib/capture';
import { prisma } from '@/lib/prisma';

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
      await prisma.contact.upsert({
        where: {
          workspaceId_email: {
            workspaceId,
            email,
          },
        },
        create: {
          workspaceId,
          companyId: company?.id,
          firstName,
          lastName,
          email,
          phone: row.phone || undefined,
          status: statusMap[row.status] ?? ContactStatus.LEAD,
          source: row.source || 'Importacion CSV',
          value: Number(row.value || 0),
          tags: row.tags ? row.tags.split('|').map((tag) => tag.trim()).filter(Boolean) : ['importado'],
          lastActivityAt: new Date(),
        },
        update: {
          companyId: company?.id,
          firstName,
          lastName,
          phone: row.phone || undefined,
          status: statusMap[row.status] ?? undefined,
          source: row.source || undefined,
          value: Number(row.value || 0),
          tags: row.tags ? row.tags.split('|').map((tag) => tag.trim()).filter(Boolean) : undefined,
          lastActivityAt: new Date(),
        },
      });
      imported += 1;
    }
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
