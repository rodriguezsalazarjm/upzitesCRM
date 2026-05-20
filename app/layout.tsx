import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
