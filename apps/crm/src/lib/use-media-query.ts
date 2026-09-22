'use client';

import { useSyncExternalStore } from 'react';

/**
 * Suscripción a un media query vía matchMedia, sin layout thrashing de un
 * resize listener propio. SSR-safe: `getServerSnapshot` devuelve `false`
 * (el breakpoint real llega en la hidratación).
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
