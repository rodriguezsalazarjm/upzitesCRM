import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { PLANS, clp } from "./content";

export const alt = "Landing Page + Branding Express de UPZITES: marca clara, landing profesional y WhatsApp listo para captar clientes.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CARBON = "#111111";
const OFF_WHITE = "#FAFBF5";
const LIME = "#A6FF00";
const ELECTRIC = "#0057FF";
const HAIRLINE = "#2E2E2E";

/** Las fuentes viven en el propio segmento para no depender de la red al buildear. */
const FONT_DIR = join(process.cwd(), "app", "soluciones", "landing-express", "og-assets");

async function loadFonts() {
  const [bebas, monoRegular, monoSemiBold] = await Promise.all([
    readFile(join(FONT_DIR, "BebasNeue-Regular.woff")),
    readFile(join(FONT_DIR, "IBMPlexMono-Regular.woff")),
    readFile(join(FONT_DIR, "IBMPlexMono-SemiBold.woff")),
  ]);

  return [
    { name: "Bebas Neue", data: bebas, style: "normal" as const, weight: 400 as const },
    { name: "IBM Plex Mono", data: monoRegular, style: "normal" as const, weight: 400 as const },
    { name: "IBM Plex Mono", data: monoSemiBold, style: "normal" as const, weight: 600 as const },
  ];
}

export default async function OpengraphImage() {
  const fonts = await loadFonts();
  const desde = clp(Math.min(...PLANS.map((plan) => plan.amountClp)));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: CARBON,
          padding: "60px 72px",
          fontFamily: "IBM Plex Mono",
        }}
      >
        {/* Cabecera: marcador de seccion + sello del plazo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 14, height: 14, background: LIME }} />
            <div
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: "0.24em",
                color: OFF_WHITE,
              }}
            >
              UPZITES · SOLUCIONES
            </div>
          </div>
          <div
            style={{
              display: "flex",
              background: LIME,
              color: CARBON,
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "0.14em",
              padding: "12px 20px",
            }}
          >
            LISTO EN 7 DÍAS
          </div>
        </div>

        {/* Titular display */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontFamily: "Bebas Neue",
            fontSize: 138,
            lineHeight: 0.92,
            letterSpacing: "-0.02em",
            color: OFF_WHITE,
          }}
        >
          <div style={{ display: "flex" }}>LANDING PAGE</div>
          <div style={{ display: "flex" }}>+ BRANDING EXPRESS</div>
        </div>

        {/* Pie: precio de entrada + dominio + flecha */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: `2px solid ${HAIRLINE}`,
            paddingTop: 28,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Un unico nodo de texto: satori exige display:flex si hay mas de un hijo. */}
            <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "0.06em", color: OFF_WHITE }}>
              {`DESDE ${desde} CLP`}
            </div>
            <div style={{ fontSize: 21, letterSpacing: "0.05em", color: OFF_WHITE, opacity: 0.72 }}>
              Marca clara · Landing profesional · WhatsApp listo
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "0.18em", color: OFF_WHITE }}>
              WWW.UPZITES.COM
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 62,
                height: 62,
                background: ELECTRIC,
              }}
            >
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                <path
                  d="M7 17 17 7M9 7h8v8"
                  stroke={OFF_WHITE}
                  strokeWidth="2.6"
                  strokeLinecap="square"
                  strokeLinejoin="miter"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
