import { assertProductionEnv } from '@/lib/env';

export async function register() {
  // Solo en el runtime de Node y no durante el build (donde Vercel aun podria
  // no exponer todas las vars): validamos al iniciar el server productivo.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  assertProductionEnv();
}
