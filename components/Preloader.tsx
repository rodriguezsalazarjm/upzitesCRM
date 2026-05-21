"use client";

import { useEffect, useState } from "react";

export function Preloader() {
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => setLoading(false), reduce ? 800 : 2400);
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
        <div className="preloader-zoom" aria-label="UPZITES">
          <img src="/images/logo/isotipo.png" alt="UPZITES" className="preloader-iso preloader-iso--1" />
          <img src="/images/logo/isotipo.png" alt="" aria-hidden="true" className="preloader-iso preloader-iso--2" />
          <img src="/images/logo/isotipo.png" alt="" aria-hidden="true" className="preloader-iso preloader-iso--3" />
        </div>
      )}
    </div>
  );
}
