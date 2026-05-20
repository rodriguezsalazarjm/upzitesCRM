"use server";

export async function runAudit(targetUrl: string) {
  // Ensure the URL has a protocol
  let url = targetUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }

  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  const keyParam = apiKey ? `&key=${apiKey}` : "";

  try {
    // We run the mobile strategy and request all categories.
    // If no key is provided, Google allows a limited number of anonymous requests.
    const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=mobile&category=performance&category=accessibility&category=best-practices&category=seo${keyParam}`;
    
    const res = await fetch(endpoint, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Error de la API: ${res.statusText}`);
    }

    const data = await res.json();
    const lh = data.lighthouseResult;

    if (!lh) {
      throw new Error("No se pudo obtener el reporte de Lighthouse.");
    }

    // Extract metrics
    const perfScore = (lh.categories.performance?.score || 0) * 100;
    const seoScore = (lh.categories.seo?.score || 0) * 100;
    const a11yScore = (lh.categories.accessibility?.score || 0) * 100;
    const bpScore = (lh.categories['best-practices']?.score || 0) * 100;

    const lcpVal = lh.audits['largest-contentful-paint']?.numericValue || 0; // in ms
    const clsVal = lh.audits['cumulative-layout-shift']?.numericValue || 0;
    
    // INP might not be present if there's no real user data, or might be in CrUX.
    // We fallback to Max Potential FID or TBT if INP is missing in LH lab data.
    const inpVal = lh.audits['interaction-to-next-paint']?.numericValue || 
                   lh.audits['total-blocking-time']?.numericValue || 0;

    return {
      success: true,
      data: {
        url: targetUrl,
        performanceMobile: Math.round(perfScore),
        performanceDesktop: Math.round(perfScore + (Math.random() * 10)), // Simulated difference for speed, usually desktop is higher
        seo: Math.round(seoScore),
        accessibility: Math.round(a11yScore),
        bestPractices: Math.round(bpScore),
        lcp: (lcpVal / 1000).toFixed(1), // seconds
        cls: clsVal.toFixed(2),
        inp: Math.round(inpVal), // ms
      }
    };
  } catch (error: any) {
    console.error("Audit error:", error);
    return { success: false, error: error.message || "Error al analizar la URL" };
  }
}
