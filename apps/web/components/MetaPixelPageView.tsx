"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  hasMetaPixelConsent,
  META_PIXEL_CONSENT_EVENT,
  pageview,
  requiresMetaPixelConsent,
  syncMetaPixelConsent,
} from "@/lib/meta-pixel";

function currentUrl(pathname: string, searchParams: URLSearchParams): string {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function MetaPixelPageViewInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [hasConsent, setHasConsent] = useState(false);
  const lastTrackedUrl = useRef<string | null>(requiresMetaPixelConsent() ? null : currentUrl(pathname, searchParams));

  const url = useMemo(() => currentUrl(pathname, searchParams), [pathname, searchParams]);

  useEffect(() => {
    function syncConsent() {
      setHasConsent(hasMetaPixelConsent());
    }

    syncConsent();
    window.addEventListener(META_PIXEL_CONSENT_EVENT, syncConsent);
    window.addEventListener("storage", syncConsent);

    return () => {
      window.removeEventListener(META_PIXEL_CONSENT_EVENT, syncConsent);
      window.removeEventListener("storage", syncConsent);
    };
  }, []);

  useEffect(() => {
    syncMetaPixelConsent(hasConsent);

    if (!hasConsent || lastTrackedUrl.current === url) return;

    pageview();
    lastTrackedUrl.current = url;
  }, [hasConsent, url]);

  return null;
}

export function MetaPixelPageView() {
  return (
    <Suspense fallback={null}>
      <MetaPixelPageViewInner />
    </Suspense>
  );
}
