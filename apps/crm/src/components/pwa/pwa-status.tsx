'use client';

import { useEffect, useState } from 'react';

export function PwaStatus() {
  const [online, setOnline] = useState(true);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    const updateOnline = () => setOnline(window.navigator.onLine);
    updateOnline();
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);

    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      const register = async () => {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        if (registration.waiting && navigator.serviceWorker.controller) {
          setWaiting(registration.waiting);
        }
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              setWaiting(worker);
            }
          });
        });
      };
      void register().catch(() => {
        // La aplicación sigue funcionando como web si el navegador rechaza SW.
      });
    }

    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  function applyUpdate() {
    if (!waiting) return;
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
      once: true,
    });
    waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  if (online && !waiting) return null;

  return (
    <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
      <p className="flex-1 text-xs leading-5 text-slate-700">
        {!online
          ? 'Estás sin conexión. Puedes leer esta pantalla, pero el CRM no enviará ni guardará cambios.'
          : 'Hay una actualización disponible. Tus borradores de Inbox se conservarán.'}
      </p>
      {online && waiting && (
        <button
          type="button"
          onClick={applyUpdate}
          className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
        >
          Actualizar
        </button>
      )}
    </div>
  );
}
