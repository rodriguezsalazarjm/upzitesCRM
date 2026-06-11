/* =====================================================================
   UPZITES — Atoms & shared UI bits
   ===================================================================== */

const { useState, useEffect, useRef } = React;

// ---------- Brand mark ----------------------------------------------
function Brand({ size }) {
  return (
    <a href="#top" className="nav-brand" aria-label="UPZITES home">
      <span className="nav-brand-iso">↗</span>
      <span className="nav-brand-word" style={size === "lg" ? { fontSize: 64 } : null}>upzites</span>
    </a>
  );
}

// ---------- Editorial eyebrow + horizontal rule ---------------------
function Eyebrow({ num, children }) {
  return (
    <div className="eyebrow-row">
      <span className="eyebrow">{num ? `${num} · ` : ""}{children}</span>
      <span className="rule"></span>
    </div>
  );
}

// ---------- Sticker / tape -----------------------------------------
function Sticker({ tone, angle, children, style }) {
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
function Pill({ children, solid, dot }) {
  return (
    <span className={`pill${solid ? " pill-solid" : ""}`}>
      {dot ? <span className="dot"></span> : null}
      {children}
    </span>
  );
}

// ---------- Barcode ------------------------------------------------
function Barcode({ heights }) {
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
function Stamp({ text, color, bg, size }) {
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
function Reveal({ children, delay, as }) {
  const ref = useRef(null);
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

Object.assign(window, { Brand, Eyebrow, Sticker, Pill, Barcode, Stamp, Reveal });
