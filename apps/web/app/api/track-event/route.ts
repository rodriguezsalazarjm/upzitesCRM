import { NextResponse } from "next/server";

const allowedTypes = new Set(["page_view", "cta_click", "form_submit", "whatsapp_click"]);

function getCrmBaseUrl() {
  return (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? "").replace(/\/+$/, "");
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const crmBaseUrl = getCrmBaseUrl();
  const publicKey = process.env.CRM_PUBLIC_KEY;

  if (!body || typeof body !== "object" || !crmBaseUrl || !publicKey) {
    return NextResponse.json({ ok: true, tracked: false });
  }

  const type = asString(body.type);
  if (!allowedTypes.has(type)) {
    return NextResponse.json({ ok: false, message: "Invalid event type" }, { status: 400 });
  }

  await fetch(`${crmBaseUrl}/api/capture/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey,
      type,
      pageUrl: asString(body.pageUrl) || request.headers.get("referer") || new URL(request.url).origin,
      referrer: asString(body.referrer) || undefined,
      element: asString(body.element) || undefined,
      metadata: {
        source: "upzites_web",
        important: Boolean(body.important),
      },
    }),
    cache: "no-store",
  }).catch((error) => {
    console.error("web_track_event_error", error);
  });

  return NextResponse.json({ ok: true, tracked: true });
}
