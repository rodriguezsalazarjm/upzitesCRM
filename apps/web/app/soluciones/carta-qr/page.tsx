import type { Metadata } from "next";
import { ViewContentOnLoad } from "@/components/MetaPixelEvents";
import { DcRuntime } from "@/components/DcRuntime";
import { css, html } from "./design.data";

export const metadata: Metadata = {
  title: "Carta QR Interactiva para Restaurantes | UPZITES",
  description: "Mucho más que una carta QR: tus clientes piden, llaman al mesero y piden la cuenta desde la mesa; tu equipo recibe todo en tiempo real.",
  openGraph: { title: "Carta QR Interactiva para Restaurantes | UPZITES", description: "Mucho más que una carta QR: tus clientes piden, llaman al mesero y piden la cuenta desde la mesa; tu equipo recibe todo en tiempo real.", type: "website" },
};

export default function CartaQrPage() {
  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap" />
      <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap" />
      <ViewContentOnLoad contentName="Carta QR Interactiva" contentCategory="solucion" contentId="landing:carta-qr" />
      <DcRuntime className="dc-qr" css={css} html={html} />
    </>
  );
}
