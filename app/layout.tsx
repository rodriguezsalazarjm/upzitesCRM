import type { Metadata } from "next";
import "./globals.css";
import { Preloader } from "@/components/Preloader";
import { ScrollProgress } from "@/components/ScrollProgress";
import { FloatingActions } from "@/components/FloatingActions";
import { CookieConsent } from "@/components/CookieConsent";
import { PromoPopup } from "@/components/PromoPopup";

export const metadata: Metadata = {
  title: "UPZITES — Diseño estratégico con carácter",
  description: "Diseño estratégico con carácter tropical underground. Branding, UX/UI y desarrollo web para marcas ambiciosas.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="scroll-smooth">
      <body>
        <Preloader />
        <ScrollProgress />
        {children}
        <FloatingActions />
        <PromoPopup />
        <CookieConsent />
      </body>
    </html>
  );
}
