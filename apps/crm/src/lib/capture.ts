import { ContactStatus, WebEventType } from '../../generated/prisma/client';
import { prisma } from './prisma';
import { noteInboundContact } from './entitlements/inbound';

export const webEventTypeMap = {
  page_view: WebEventType.PAGE_VIEW,
  cta_click: WebEventType.CTA_CLICK,
  form_submit: WebEventType.FORM_SUBMIT,
  whatsapp_click: WebEventType.WHATSAPP_CLICK,
} as const;

export async function getWorkspaceByPublicKey(publicKey: string) {
  return prisma.workspace.findUnique({
    where: { publicKey },
    select: { id: true, name: true, slug: true, publicKey: true },
  });
}

export function splitName(name?: string | null) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return { firstName: 'Lead', lastName: 'Web' };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: 'Sin apellido' };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

export async function upsertLeadContact(input: {
  workspaceId: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  source: string;
  pageUrl?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}) {
  const { firstName, lastName } = splitName(input.name);

  // P0-C: un lead entrante real NUNCA se pierde por `contacts.max`. Se crea
  // aunque el uso quede sobre el limite y se audita
  // (`contacts.inbound_over_limit`); lo que se bloquea son las altas
  // proactivas del negocio (crear a mano, importar).
  const existing = input.email
    ? await prisma.contact.findUnique({
        where: { workspaceId_email: { workspaceId: input.workspaceId, email: input.email } },
        select: { id: true },
      })
    : null;

  const company = input.company
    ? await prisma.company.upsert({
        where: {
          workspaceId_name: {
            workspaceId: input.workspaceId,
            name: input.company,
          },
        },
        create: {
          workspaceId: input.workspaceId,
          name: input.company,
        },
        update: {},
      })
    : null;

  let contact;
  if (input.email) {
    contact = await prisma.contact.upsert({
      where: {
        workspaceId_email: {
          workspaceId: input.workspaceId,
          email: input.email,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        companyId: company?.id,
        firstName,
        lastName,
        email: input.email,
        phone: input.phone,
        status: ContactStatus.LEAD,
        source: input.source,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        tags: ['web'],
        lastActivityAt: new Date(),
      },
      update: {
        companyId: company?.id,
        firstName,
        lastName,
        phone: input.phone,
        source: input.source,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        lastActivityAt: new Date(),
      },
    });
  } else {
    contact = await prisma.contact.create({
      data: {
        workspaceId: input.workspaceId,
        companyId: company?.id,
        firstName,
        lastName,
        phone: input.phone,
        status: ContactStatus.LEAD,
        source: input.source,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        tags: ['web'],
        lastActivityAt: new Date(),
      },
    });
  }

  if (!existing) await noteInboundContact({ workspaceId: input.workspaceId, contactId: contact.id, source: 'FORM' });
  return contact;
}

export function publicCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
