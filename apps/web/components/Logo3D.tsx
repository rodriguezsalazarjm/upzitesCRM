"use client";

import React, { Component, useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";

// Heavy 3D stack (three.js + react-three-fiber). Loaded client-side only and
// only once the section is near the viewport, so it never touches the initial
// bundle / LCP.
const SVG3D = dynamic(() => import("3dsvg").then((m) => m.SVG3D), { ssr: false });

const LOGO_SVG = `<svg version="1.0" xmlns="http://www.w3.org/2000/svg" width="152pt" height="115pt" viewBox="0 0 152 115" preserveAspectRatio="xMidYMid meet">
<g transform="translate(0,115) scale(0.1,-0.1)" fill="#111111" stroke="none">
<path d="M2 704 l3 -446 305 -129 305 -128 453 -1 452 0 0 444 0 443 -312 132 -313 131 -448 0 -447 0 2 -446z m678 6 l0 -270 -45 0 -45 0 0 197 0 198 -168 -168 -168 -168 -29 31 -29 31 164 164 165 165 -188 0 -187 0 0 45 0 45 265 0 265 0 0 -270z"/>
</g>
</svg>`;

const Fallback = () => (
  <img src="/images/logo/isotipo.webp" alt="UPZITES" className="logo3d-fallback" />
);

// If the 3D renderer throws at runtime, degrade to the flat logo instead of
// breaking the page.
class Safe3D extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <Fallback /> : this.props.children;
  }
}

export function Logo3D() {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const raf = requestAnimationFrame(() => setReduce(true));
      return () => cancelAnimationFrame(raf);
    }
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      const raf = requestAnimationFrame(() => setShow(true));
      return () => cancelAnimationFrame(raf);
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setShow(true);
            io.disconnect();
          }
        });
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className="logo3d" role="img" aria-label="Isotipo UPZITES en 3D">
      {show && !reduce ? (
        <Safe3D>
          <SVG3D
            svg={LOGO_SVG}
            color="#111111"
            smoothness={0.6}
            material="default"
            metalness={0}
            roughness={0.5}
            animate="swing"
            cursorOrbit
            orbitStrength={0.06}
            resetOnIdle
          />
        </Safe3D>
      ) : (
        <Fallback />
      )}
    </div>
  );
}
