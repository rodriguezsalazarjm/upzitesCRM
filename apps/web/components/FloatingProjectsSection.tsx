import Link from "next/link";

/* Intro "OUR WORK" estilo yourcreative: el hero queda FIJO (sticky) y la sección
   siguiente (Projects) sube y lo TAPA (scroll-over reveal). Sin JS: puro sticky
   + overlap. El pull-up de Projects está en page.tsx.
   (Requiere body con overflow-x:clip, no hidden, para que sticky funcione.) */
type Pill = {
  label: string; href: string; bg: string; fg: string;
  left: string; top: string; rot: number; hideM?: boolean;
};

const PILLS: Pill[] = [
  { label: "Gloobitos", href: "/proyectos", bg: "#A6FF00", fg: "#111111", left: "6%", top: "22%", rot: -7 },
  { label: "Dirty Pizza", href: "/proyectos", bg: "#FF3B30", fg: "#FFFFFF", left: "58%", top: "16%", rot: 6 },
  { label: "Kori Ramen", href: "/proyectos", bg: "#FFD100", fg: "#111111", left: "26%", top: "72%", rot: 4, hideM: true },
  { label: "V&R Automotriz", href: "/proyectos", bg: "#0057FF", fg: "#FFFFFF", left: "60%", top: "70%", rot: -5, hideM: true },
  { label: "Avacos", href: "/proyectos", bg: "#FF5CAB", fg: "#111111", left: "12%", top: "54%", rot: 8 },
  { label: "Iron Mallas", href: "/proyectos", bg: "#111111", fg: "#FAFBF5", left: "76%", top: "46%", rot: -4, hideM: true },
  { label: "Valle Smash", href: "/proyectos", bg: "#FFBA00", fg: "#111111", left: "40%", top: "80%", rot: 3, hideM: true },
];

const pillBase: React.CSSProperties = {
  display: "block", whiteSpace: "nowrap", borderRadius: 999, padding: "12px 26px",
  fontFamily: "var(--font-text)", fontWeight: 800, fontSize: "clamp(13px, 1.5vw, 20px)",
  letterSpacing: "0.01em", textTransform: "uppercase", border: "2px solid #111",
  boxShadow: "0 5px 0 0 #111", textDecoration: "none", userSelect: "none",
};

export function FloatingProjectsSection() {
  return (
    <section data-screen-label="04 Selected work" style={{ position: "relative", height: "180svh", zIndex: 0 }}>
      <div style={{ position: "sticky", top: 0, height: "100svh", overflow: "hidden", background: "var(--bg-1)" }}>
        {/* grid editorial sutil */}
        <div className="absolute inset-0 grid grid-cols-6" style={{ opacity: 0.07 }} aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ borderRight: "1px solid #111" }} />
          ))}
        </div>

        <span
          className="absolute left-6 top-8 z-30 md:left-12 md:top-12"
          style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--upz-ash)" }}
        >
          04 · Selected work
        </span>

        <div className="absolute inset-0 flex items-center justify-center" style={{ overflow: "hidden" }}>
          <h2
            style={{
              fontFamily: "var(--font-display)", fontWeight: 900,
              fontSize: "clamp(64px, 19vw, 340px)", lineHeight: 0.82, letterSpacing: "-0.04em",
              textTransform: "uppercase", color: "var(--upz-carbon)", whiteSpace: "nowrap", margin: 0,
            }}
          >
            OUR WORK
          </h2>
        </div>

        {PILLS.map((p, i) => (
          <div key={i} className={`absolute z-20 ${p.hideM ? "hidden md:block" : ""}`} style={{ left: p.left, top: p.top, transform: `rotate(${p.rot}deg)` }}>
            <Link href={p.href} aria-label={p.label} style={{ ...pillBase, background: p.bg, color: p.fg }}>
              {p.label}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
