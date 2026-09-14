import type { Metadata } from 'next';
import './globals.css';
import { PwaStatus } from '@/components/pwa/pwa-status';

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
  themeColor: '#2563eb',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="antialiased">
        {children}
        <PwaStatus />
      </body>
    </html>
  );
}
