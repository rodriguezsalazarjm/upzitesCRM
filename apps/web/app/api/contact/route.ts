import { NextResponse } from "next/server";

type ContactPayload = Record<string, string | boolean | null>;

const requiredFields = ["name", "email", "message"];

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getCrmBaseUrl() {
  return (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? "").replace(/\/+$/, "");
}

async function forwardToCrm(payload: ContactPayload) {
  const crmBaseUrl = getCrmBaseUrl();
  const formPublicId = process.env.CRM_CAPTURE_FORM_PUBLIC_ID;

  if (!crmBaseUrl || !formPublicId) {
    return { synced: false, reason: "CRM capture env vars are not configured" };
  }

  const response = await fetch(`${crmBaseUrl}/api/capture/forms/${formPublicId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "CRM capture failed");
    throw new Error(message);
  }

  return { synced: true };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Solicitud invalida" }, { status: 400 });
  }

  const payload: ContactPayload = {
    name: asString(body.name),
    email: asString(body.email),
    phone: asString(body.whatsapp) || asString(body.phone),
    whatsapp: asString(body.whatsapp),
    instagram: asString(body.instagram),
    kind: asString(body.kind),
    briefType: asString(body.briefType),
    company: asString(body.company),
    industry: asString(body.industry),
    service: asString(body.service),
    budget: asString(body.budget),
    urgency: asString(body.urgency),
    message: asString(body.message),
    consent: Boolean(body.consent),
    pageUrl: asString(body.pageUrl),
    referrer: asString(body.referrer),
    utmSource: asString(body.utmSource),
    utmMedium: asString(body.utmMedium),
    utmCampaign: asString(body.utmCampaign),
  };

  const missing = requiredFields.filter((field) => !payload[field]);
  if (missing.length > 0 || !payload.consent) {
    return NextResponse.json(
      { message: "Completa los campos obligatorios y acepta el consentimiento." },
      { status: 400 },
    );
  }

  try {
    const crm = await forwardToCrm(payload);
    return NextResponse.json({
      ok: true,
      crm,
      message: "Solicitud recibida con exito.",
    });
  } catch (error) {
    console.error("contact_form_crm_error", error);
    return NextResponse.json(
      {
        ok: true,
        crm: { synced: false, reason: "CRM capture failed" },
        message: "Solicitud recibida. Revisaremos el mensaje y te contactaremos pronto.",
      },
    );
  }
}
