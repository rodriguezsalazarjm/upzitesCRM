import { ActivationStatus } from '../../generated/prisma/client';
import { prisma } from '../../src/lib/prisma';

/**
 * Activa un workspace de prueba saltandose el wizard.
 *
 * Desde la Fase 9 un workspace nace en ONBOARDING y ni el agente ni los
 * journeys escriben hasta que se activa. Las suites anteriores a esa fase
 * prueban otra cosa —los agentes, la recuperacion— y no tiene sentido que cada
 * una monte un onboarding completo para llegar a lo suyo.
 *
 * Se escribe el estado directamente, sin pasar por `activateWorkspace`, a
 * proposito: la puerta de activacion se prueba en la suite de la Fase 9, con
 * sus requisitos de verdad. Aqui solo se necesita el efecto.
 */
export async function activateForTests(workspaceId: string) {
  await prisma.workspaceActivation.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      status: ActivationStatus.ACTIVE,
      activatedAt: new Date(),
      note: 'Activado por la suite de pruebas.',
    },
    update: { status: ActivationStatus.ACTIVE, activatedAt: new Date() },
  });
}
