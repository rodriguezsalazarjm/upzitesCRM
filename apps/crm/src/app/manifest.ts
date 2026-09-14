import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CRM Upzites',
    short_name: 'Upzites CRM',
    description: 'Atiende conversaciones y gestiona tus ventas desde cualquier dispositivo.',
    start_url: '/inbox',
    scope: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#2563eb',
    lang: 'es-CL',
    categories: ['business', 'productivity'],
    icons: [
      {
        src: '/icons/upzites-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/upzites-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/upzites-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
