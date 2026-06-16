import { NextResponse } from "next/server";

function getCrmBaseUrl() {
  return (process.env.NEXT_PUBLIC_CRM_BASE_URL ?? "").replace(/\/+$/, "");
}

async function trackBrochureDownload(request: Request) {
  const crmBaseUrl = getCrmBaseUrl();
  const publicKey = process.env.CRM_PUBLIC_KEY;

  if (!crmBaseUrl || !publicKey) return;

  const url = new URL(request.url);
  const referrer = request.headers.get("referer") ?? undefined;
  const pageUrl = referrer || url.origin;

  await fetch(`${crmBaseUrl}/api/capture/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey,
      type: "cta_click",
      pageUrl,
      referrer,
      element: "brochure_download",
      metadata: {
        important: true,
        action: "download_brochure",
        file: "brochure-upzites.pdf",
        source: url.searchParams.get("source") || "web",
      },
    }),
    cache: "no-store",
  }).catch((error) => {
    console.error("brochure_download_tracking_error", error);
  });
}

export async function GET(request: Request) {
  await trackBrochureDownload(request);

  const url = new URL("/brochure-upzites.pdf", request.url);
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
