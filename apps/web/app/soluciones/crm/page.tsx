import type { Metadata } from "next";
import { ViewContentOnLoad } from "@/components/MetaPixelEvents";
import { DcRuntime } from "@/components/DcRuntime";
import { css, html } from "./design.data";
import { mobileFix } from "../mobile-fix";

export const metadata: Metadata = {
  title: "CRM UPZITES · Captura y convierte tus leads | UPZITES",
  description: "Un CRM que captura tus leads desde web, formularios y WhatsApp, los ordena y te ayuda a cerrar más ventas.",
  openGraph: { title: "CRM UPZITES · Captura y convierte tus leads | UPZITES", description: "Un CRM que captura tus leads desde web, formularios y WhatsApp, los ordena y te ayuda a cerrar más ventas.", type: "website" },
};

export default function CrmLandingPage() {
  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap" />
      <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap" />
      <ViewContentOnLoad contentName="CRM UPZITES" contentCategory="solucion" contentId="landing:crm" />
      <DcRuntime className="dc-crm" css={css + mobileFix} html={html} />
    </>
  );
}
