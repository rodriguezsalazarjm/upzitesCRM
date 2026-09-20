import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { PwaStatus } from '@/components/pwa/pwa-status';

// Tipografía de marca: Helvena para texto/UI, Bebas Neue para display
// (títulos de página y cifras grandes). Ambas autoalojadas (sin red en runtime);
// mismos archivos que ya están versionados en apps/web.
const helvena = localFont({
  src: [
    { path: './fonts/Helvena-Regular.otf', weight: '400', style: 'normal' },
    { path: './fonts/Helvena-Medium.otf', weight: '500', style: 'normal' },
    { path: './fonts/Helvena-Semibold.otf', weight: '600', style: 'normal' },
    { path: './fonts/Helvena-Bold.otf', weight: '700', style: 'normal' },
    { path: './fonts/Helvena-Extrabold.otf', weight: '800', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-helvena',
});

const bebas = localFont({
  src: [{ path: './fonts/BebasNeue-Regular.woff', weight: '400', style: 'normal' }],
  display: 'swap',
  variable: '--font-bebas',
});

export const metadata: Metadata = {
  title: 'CRM Upzites',
  description: 'CRM web-first para crecimiento comercial de pymes chilenas',
  manifest: '/manifest.webmanifest',
  applicationName: 'CRM Upzites',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Upzites CRM' },
  icons: {
    icon: [
      { url: '/icons/upzites-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/upzites-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/upzites-180.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FAFBF5',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${helvena.variable} ${bebas.variable}`}>
      <body className="antialiased">
        {children}
        <PwaStatus />
      </body>
    </html>
  );
}
