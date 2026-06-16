import { NextResponse } from 'next/server';
import { ActivityType, WebEventType } from '../../../../../../../generated/prisma/client';
import { publicCorsHeaders, upsertLeadContact } from '@/lib/capture';
import { prisma } from '@/lib/prisma';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: publicCorsHeaders() });
}

export async function POST(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const form = await prisma.form.findUnique({
    where: { publicId },
  });

  if (!form || !form.isActive) {
    return NextResponse.json({ message: 'Formulario no disponible' }, { status: 404, headers: publicCorsHeaders() });
  }

  const contentType = request.headers.get('content-type') ?? '';
  const rawData =
    contentType.includes('application/json')
      ? await request.json()
      : Object.fromEntries((await request.formData()).entries());
  const data = Object.fromEntries(
    Object.entries(rawData).map(([key, value]) => [key, typeof value === 'string' ? value : String(value)]),
  );

  const name = String(data.name ?? '');
  const email = String(data.email ?? '');
  const phone = String(data.phone ?? '');
  const company = String(data.company ?? '');
  const message = String(data.message ?? '');
  const pageUrl = String(data.pageUrl ?? '');
  const referrer = String(data.referrer ?? '');
  const utmSource = String(data.utmSource ?? '');
  const utmMedium = String(data.utmMedium ?? '');
  const utmCampaign = String(data.utmCampaign ?? '');

  const contact = await upsertLeadContact({
    workspaceId: form.workspaceId,
    name,
    email,
    phone,
    company,
    source: form.source,
    pageUrl,
    utmSource,
    utmMedium,
    utmCampaign,
  });

  await prisma.formSubmission.create({
    data: {
      workspaceId: form.workspaceId,
      formId: form.id,
      contactId: contact.id,
      payload: data,
      pageUrl: pageUrl || null,
      referrer: referrer || null,
      utmSource: utmSource || null,
      utmMedium: utmMedium || null,
      utmCampaign: utmCampaign || null,
    },
  });

  await prisma.activity.create({
    data: {
      workspaceId: form.workspaceId,
      contactId: contact.id,
      type: ActivityType.NOTE,
      title: 'Nuevo lead desde formulario web',
      description: message || `Formulario: ${form.name}`,
    },
  });

  await prisma.webEvent.create({
    data: {
      workspaceId: form.workspaceId,
      type: WebEventType.FORM_SUBMIT,
      pageUrl: pageUrl || 'Formulario embebido',
      referrer: referrer || null,
      formId: form.id,
      contactId: contact.id,
      utmSource: utmSource || null,
      utmMedium: utmMedium || null,
      utmCampaign: utmCampaign || null,
      metadata: { formPublicId: form.publicId },
    },
  });

  if (contentType.includes('application/json')) {
    return NextResponse.json({ ok: true, contactId: contact.id }, { headers: publicCorsHeaders() });
  }

  return new NextResponse(
    '<!doctype html><meta charset="utf-8"><p style="font-family:system-ui;color:#0f172a">Gracias. Te contactaremos pronto.</p>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8', ...publicCorsHeaders() } },
  );
}
