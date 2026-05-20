"use client";

import React, { useState, useEffect, useRef } from "react";

// ---------- Brand mark ----------------------------------------------
export function Brand({ size }: { size?: "lg" }) {
  return (
    <a href="#top" className={`nav-brand${size === "lg" ? " nav-brand--lg" : ""}`} aria-label="UPZITES home">
      <img src="/images/upzites-logo-full.png" alt="UPZITES" className="nav-brand-img" />
    </a>
  );
}

// ---------- Editorial eyebrow + horizontal rule ---------------------
export function Eyebrow({ num, children }: { num?: string, children: React.ReactNode }) {
  return (
    <div className="eyebrow-row">
      <span className="eyebrow">{num ? `${num} · ` : ""}{children}</span>
      <span className="rule"></span>
    </div>
  );
}

// ---------- Sticker / tape -----------------------------------------
export function Sticker({ tone, angle, children, style }: { tone?: string, angle?: number, children: React.ReactNode, style?: React.CSSProperties }) {
  return (
    <span
      className={`sticker sticker-${tone || "lime"}`}
      style={{ transform: `rotate(${angle ?? -3}deg)`, ...(style || {}) }}
    >
      {children}
    </span>
  );
}

// ---------- Pill chip ----------------------------------------------
export function Pill({ children, solid, dot }: { children: React.ReactNode, solid?: boolean, dot?: boolean }) {
  return (
    <span className={`pill${solid ? " pill-solid" : ""}`}>
      {dot ? <span className="dot"></span> : null}
      {children}
    </span>
  );
}

// ---------- Barcode ------------------------------------------------
export function Barcode({ heights }: { heights?: number[] }) {
  const hs = heights || [28,20,24,16,28,14,22,28,18,22,24,20,28,16,24,28,18,22,26,14,22,28,16,24,18,22];
  return (
    <span className="barcode" aria-hidden="true">
      {hs.map((h, i) => (
        <i key={i} style={{ height: h + "px", width: (i % 3 === 0 ? 3 : 2) + "px" }}></i>
      ))}
    </span>
  );
}

// ---------- Stamp (circle with text on path) -----------------------
export function Stamp({ text, color, bg, size }: { text: string, color?: string, bg?: string, size?: number }) {
  const s = size || 132;
  const r = s / 2 - 12;
  return (
    <div className="hero-stamp" style={{ width: s, height: s, background: bg, color }}>
      <svg viewBox={`0 0 ${s} ${s}`}>
        <defs>
          <path id="stamp-path" d={`M ${s/2}, ${s/2} m -${r}, 0 a ${r},${r} 0 1,1 ${r*2},0 a ${r},${r} 0 1,1 -${r*2},0`} />
        </defs>
        <text fill="currentColor" style={{
          fontFamily: "var(--font-text)", fontWeight: 800,
          fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase"
        }}>
          <textPath href="#stamp-path" startOffset="0">
            {text}
          </textPath>
        </text>
      </svg>
      <span className="hero-stamp-arrow">↗</span>
    </div>
  );
}

// ---------- Reveal-on-scroll (IntersectionObserver) ----------------
export function Reveal({ children, delay, as }: { children: React.ReactNode, delay?: number, as?: any }) {
  const ref = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setSeen(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.12 }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  const Tag = as || "div";
  return (
    <Tag
      ref={ref}
      className={`reveal${seen ? " is-in" : ""}`}
      style={{ transitionDelay: delay ? `${delay}ms` : undefined }}
    >
      {children}
    </Tag>
  );
}
