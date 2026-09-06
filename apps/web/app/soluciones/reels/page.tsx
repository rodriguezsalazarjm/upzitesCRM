import type { Metadata } from "next";
import { ViewContentOnLoad } from "@/components/MetaPixelEvents";
import { DcRuntime } from "@/components/DcRuntime";
import { css, html } from "./design.data";

export const metadata: Metadata = {
  title: "Reel Express 24H · Contenido para redes en 24 horas | UPZITES",
  description: "Grabamos, editamos y entregamos reels, videos UGC y contenido comercial vertical listo para publicar en 24 horas.",
  openGraph: { title: "Reel Express 24H · Contenido para redes en 24 horas | UPZITES", description: "Grabamos, editamos y entregamos reels, videos UGC y contenido comercial vertical listo para publicar en 24 horas.", type: "website" },
};

export default function ReelsPage() {
  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@400;700&display=swap" />
      <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap" />
      <ViewContentOnLoad contentName="Reel Express 24H" contentCategory="solucion" contentId="landing:reels" />
      <DcRuntime className="dc-reels" css={css} html={html} />
    </>
  );
}
