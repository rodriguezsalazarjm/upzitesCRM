import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getWorkspaceByPublicKey, publicCorsHeaders, webEventTypeMap } from '@/lib/capture';
import { prisma } from '@/lib/prisma';

const eventSchema = z.object({
  publicKey: z.string().min(1),
  type: z.enum(['page_view', 'cta_click', 'form_submit', 'whatsapp_click']),
  pageUrl: z.string().url(),
  referrer: z.string().optional(),
  element: z.string().optional(),
  formId: z.string().optional(),
  contactId: z.string().optional(),
  visitorId: z.string().optional(),
  sessionId: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: publicCorsHeaders() });
}

export async function POST(request: Request) {
  const input = eventSchema.parse(await request.json());
  const workspace = await getWorkspaceByPublicKey(input.publicKey);

  if (!workspace) {
    return NextResponse.json({ message: 'Workspace not found' }, { status: 404, headers: publicCorsHeaders() });
  }

  await prisma.webEvent.create({
    data: {
      workspaceId: workspace.id,
      type: webEventTypeMap[input.type],
      pageUrl: input.pageUrl,
      referrer: input.referrer,
      element: input.element,
      formId: input.formId,
      contactId: input.contactId,
      visitorId: input.visitorId,
      sessionId: input.sessionId,
      utmSource: input.utmSource,
      utmMedium: input.utmMedium,
      utmCampaign: input.utmCampaign,
      metadata: input.metadata,
    },
  });

  return NextResponse.json({ ok: true }, { headers: publicCorsHeaders() });
}
