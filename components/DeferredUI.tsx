"use client";

import dynamic from "next/dynamic";

// Non-critical, fixed-position overlays. They occupy no layout space, so
// loading them client-side (ssr:false) reduces initial JS without any CLS
// or visual change.
const ScrollProgress = dynamic(
  () => import("./ScrollProgress").then((m) => m.ScrollProgress),
  { ssr: false }
);
const FloatingActions = dynamic(
  () => import("./FloatingActions").then((m) => m.FloatingActions),
  { ssr: false }
);
const PromoPopup = dynamic(
  () => import("./PromoPopup").then((m) => m.PromoPopup),
  { ssr: false }
);
const CookieConsent = dynamic(
  () => import("./CookieConsent").then((m) => m.CookieConsent),
  { ssr: false }
);

export function DeferredUI() {
  return (
    <>
      <ScrollProgress />
      <FloatingActions />
      <PromoPopup />
      <CookieConsent />
    </>
  );
}
