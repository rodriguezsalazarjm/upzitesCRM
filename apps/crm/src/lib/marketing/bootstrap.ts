import { JourneyStatus, SegmentSource } from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { PRESET_JOURNEYS } from './journeys';
import { PRESET_SEGMENTS } from './segments';

/**
 * Configuracion de recuperacion de un workspace nuevo: politica de contacto,
 * segmentos de fabrica y journeys de fabrica.
 *
 * **Vive fuera de la transaccion de registro a proposito.** Meterlo dentro
 * costaba una decena de viajes extra a la base y hacia que el alta de un
 * cliente rozara —y a veces pasara— el limite de 5 s de una transaccion
 * interactiva. Un registro que falla porque un segmento de ejemplo tardo de mas
 * es un fallo inaceptable en el peor momento posible.
 *
 * Nada de esto es parte de la invariante "el cliente existe": si falla, el
 * workspace funciona igual y basta volver a llamar aqui. Por eso todo es
 * idempotente y se hace en tres escrituras masivas en vez de una por fila.
 */
export async function bootstrapMarketing(workspaceId: string) {
  await prisma.messagingPolicy.upsert({
    where: { workspaceId },
    create: { workspaceId },
    update: {},
  });

  // Fase 9: perfil comercial vacio y estado de onboarding. El workspace nace
  // SIN activar: el agente no atiende solo hasta que el cliente complete el
  // wizard y active a proposito.
  await prisma.workspaceProfile.upsert({
    where: { workspaceId },
    create: { workspaceId },
    update: {},
  });

  await prisma.workspaceActivation.upsert({
    where: { workspaceId },
    create: { workspaceId },
    update: {},
  });

  await prisma.segment.createMany({
    data: PRESET_SEGMENTS.map((preset) => ({
      workspaceId,
      key: preset.key,
      name: preset.name,
      description: preset.description,
      source: SegmentSource.PRESET,
      definition: preset.definition,
    })),
    skipDuplicates: true,
  });

  await prisma.journey.createMany({
    data: PRESET_JOURNEYS.map((preset) => ({
      workspaceId,
      key: preset.key,
      name: preset.name,
      description: preset.description,
      trigger: preset.trigger,
      // En borrador: publicar significa empezar a escribirle a gente real y esa
      // es una decision del cliente, igual que con el agente de la Fase 4.
      status: JourneyStatus.DRAFT,
    })),
    skipDuplicates: true,
  });

  const journeys = await prisma.journey.findMany({
    where: { workspaceId, key: { in: PRESET_JOURNEYS.map((preset) => preset.key) } },
    select: { id: true, key: true, _count: { select: { steps: true } } },
  });

  const steps = journeys.flatMap((journey) => {
    // Un journey que ya tiene pasos no se toca: puede haberlos editado el
    // cliente, y volver a insertar los de fabrica se los pisaria.
    if (journey._count.steps > 0) return [];

    const preset = PRESET_JOURNEYS.find((item) => item.key === journey.key);
    if (!preset) return [];

    return preset.steps.map((step) => ({
      journeyId: journey.id,
      position: step.position,
      label: step.label,
      action: step.action,
      delayHours: step.delayHours,
      channel: step.channel ?? null,
      body: step.body ?? null,
    }));
  });

  if (steps.length > 0) {
    await prisma.journeyStep.createMany({ data: steps, skipDuplicates: true });
  }

  return { segments: PRESET_SEGMENTS.length, journeys: journeys.length, steps: steps.length };
}
