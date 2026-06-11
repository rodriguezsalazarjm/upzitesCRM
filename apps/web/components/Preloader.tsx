"use client";

import { useEffect, useState } from "react";

export function Preloader() {
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Keep the intro brief so it never blocks the hero / LCP.
    const t = setTimeout(() => setLoading(false), reduce ? 200 : 500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!loading) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [loading]);

  return (
    <div className={`preloader${loading ? "" : " is-done"}`} aria-hidden={!loading}>
      {mounted && (
        <div className="preloader-stage">
          <img src="/images/upzites-white.webp" alt="UPZITES" className="preloader-logo" width={621} height={170} />
          <div className="preloader-bar"><span /></div>
        </div>
      )}
    </div>
  );
}
