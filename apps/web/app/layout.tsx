import type { Metadata } from "next";
import { Bebas_Neue } from "next/font/google";
import "./globals.css";
import { Preloader } from "@/components/Preloader";
import { DeferredUI } from "@/components/DeferredUI";
import { MetaPixelNoScript, MetaPixelScript } from "@/components/MetaPixel";
import { MetaPixelPageView } from "@/components/MetaPixelPageView";
import { ContentProtection } from "@/components/ContentProtection";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SITE_URL } from "@/lib/blog";

const bebas = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bebas",
});

export const metadata: Metadata = {
  // Necesario para que las imagenes OG/Twitter generadas por archivo
  // (opengraph-image.tsx) se sirvan con URL absoluta. Sin esto Next cae a
  // localhost/VERCEL_URL y el preview de WhatsApp o Facebook queda roto.
  metadataBase: new URL(SITE_URL),
  title: "UPZITES — Diseño estratégico con carácter",
  description: "Diseño estratégico con carácter tropical underground. Branding, UX/UI y desarrollo web para marcas ambiciosas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`scroll-smooth ${bebas.variable}`}>
      <head>
        <MetaPixelScript />
      </head>
      <body>
        <MetaPixelNoScript />
        <Preloader />
        {children}
        <ContentProtection />
        <DeferredUI />
        <MetaPixelPageView />
        <SpeedInsights />
      </body>
    </html>
  );
}
