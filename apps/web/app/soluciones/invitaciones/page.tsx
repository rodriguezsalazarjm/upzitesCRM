import type { Metadata } from "next";
import { ViewContentOnLoad } from "@/components/MetaPixelEvents";
import { DcRuntime } from "@/components/DcRuntime";
import { css, html } from "./design.data";
import { mobileFix } from "../mobile-fix";

export const metadata: Metadata = {
  title: "Invitaciones Digitales Personalizadas | UPZITES",
  description: "Invitaciones web elegantes, interactivas y fáciles de compartir para bodas, cumpleaños, baby showers y eventos especiales. Diseñadas por UPZITES.",
  openGraph: { title: "Invitaciones Digitales Personalizadas | UPZITES", description: "Invitaciones web elegantes, interactivas y fáciles de compartir para bodas, cumpleaños, baby showers y eventos especiales. Diseñadas por UPZITES.", type: "website" },
};

export default function InvitacionesPage() {
  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,500;1,600&display=swap" />
      <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap" />
      <ViewContentOnLoad contentName="Invitaciones Digitales" contentCategory="solucion" contentId="landing:invitaciones" />
      <DcRuntime className="dc-invita" css={css + mobileFix} html={html} />
    </>
  );
}
