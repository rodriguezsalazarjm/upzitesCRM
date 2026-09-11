import {
  AlertKind,
  AlertSeverity,
  IntegrationStatus,
  WhatsAppChannelStatus,
} from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { checkAllowance, getEntitlements } from './usage';
import type { AllowanceMetric } from './plans';

/**
 * Avisos operativos dirigidos al cliente.
 *
 * Se guardan en vez de calcularse al vuelo por una sola razon: hace falta saber
 * si ya se aviso. Un panel que recalcula el mismo problema cada vez que se
 * abre no puede distinguir "esto acaba de romperse" de "esto lleva roto una
 * semana", y repetir el mismo aviso consigue que se ignoren todos.
 *
 * `dedupeKey` identifica el motivo, no el momento: mientras el problema siga
 * abierto es el mismo aviso, con su fecha original.
 */

export type RaiseAlertInput = {
  workspaceId: string;
  kind: AlertKind;
  severity?: AlertSeverity;
  title: string;
  detail?: string;
  dedupeKey: string;
};

export async function raiseAlert(input: RaiseAlertInput) {
  return prisma.workspaceAlert.upsert({
    where: {
      workspaceId_dedupeKey: { workspaceId: input.workspaceId, dedupeKey: input.dedupeKey },
    },
    create: {
      workspaceId: input.workspaceId,
      kind: input.kind,
      severity: input.severity ?? AlertSeverity.WARNING,
      title: input.title,
      detail: input.detail ?? null,
      dedupeKey: input.dedupeKey,
    },
    // Se actualiza el texto y se reabre si estaba resuelto, pero NO se toca
    // `createdAt`: cuanto lleva roto es la informacion mas util del aviso.
    update: {
      severity: input.severity ?? AlertSeverity.WARNING,
      title: input.title,
      detail: input.detail ?? null,
      resolvedAt: null,
    },
  });
}

export async function resolveAlert(workspaceId: string, dedupeKey: string) {
  const result = await prisma.workspaceAlert.updateMany({
    where: { workspaceId, dedupeKey, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });

  return result.count;
}

export async function openAlerts(workspaceId: string) {
  return prisma.workspaceAlert.findMany({
    where: { workspaceId, resolvedAt: null },
    orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }],
  });
}

/** Umbral a partir del cual avisar que un cupo se esta agotando. */
const NEAR_LIMIT_PERCENT = 80;

/**
 * Revisa la salud del workspace y levanta o resuelve los avisos.
 *
 * Resolver importa tanto como levantar: un aviso que no se cierra solo cuando
 * el problema se arregla entrena al cliente a ignorar el panel.
 */
export async function scanWorkspaceHealth(workspaceId: string) {
  const raised: string[] = [];
  const resolved: string[] = [];

  const track = async (
    condition: boolean,
    input: Omit<RaiseAlertInput, 'workspaceId'>,
  ) => {
    if (condition) {
      await raiseAlert({ workspaceId, ...input });
      raised.push(input.dedupeKey);
    } else if ((await resolveAlert(workspaceId, input.dedupeKey)) > 0) {
      resolved.push(input.dedupeKey);
    }
  };

  // --- Integraciones caidas ---
  const channels = await prisma.whatsAppChannel.findMany({
    where: { workspaceId },
    select: { id: true, displayPhoneNumber: true, status: true },
  });

  for (const channel of channels) {
    const down = channel.status === WhatsAppChannelStatus.NEEDS_ATTENTION;
    await track(down, {
      kind: AlertKind.INTEGRATION_DOWN,
      severity: AlertSeverity.CRITICAL,
      title: `WhatsApp necesita atencion: ${channel.displayPhoneNumber}`,
      detail: 'El canal dejo de aceptar envios. Revisa el token y el numero en Meta.',
      dedupeKey: `whatsapp-down:${channel.id}`,
    });
  }

  const commerce = await prisma.commerceConnection.findMany({
    where: { workspaceId },
    select: { id: true, provider: true, status: true },
  });

  for (const connection of commerce) {
    // `status` es texto libre en esta tabla, no un enum.
    const down = connection.status === 'ERROR';
    await track(down, {
      kind: AlertKind.INTEGRATION_DOWN,
      severity: AlertSeverity.CRITICAL,
      title: `${connection.provider} dejo de responder`,
      detail: 'La sincronizacion del catalogo esta fallando.',
      dedupeKey: `commerce-down:${connection.id}`,
    });
  }

  const integrations = await prisma.integration.findMany({
    where: { workspaceId, status: IntegrationStatus.NEEDS_ATTENTION },
    select: { id: true, name: true },
  });

  const erroredIds = new Set(integrations.map((integration) => integration.id));
  const allIntegrations = await prisma.integration.findMany({
    where: { workspaceId },
    select: { id: true, name: true },
  });

  for (const integration of allIntegrations) {
    await track(erroredIds.has(integration.id), {
      kind: AlertKind.INTEGRATION_DOWN,
      severity: AlertSeverity.WARNING,
      title: `${integration.name} necesita atencion`,
      dedupeKey: `integration-down:${integration.id}`,
    });
  }

  // --- Cupos ---
  const entitlements = await getEntitlements(workspaceId);

  if (entitlements) {
    const metrics = Object.keys(entitlements.plan.allowances) as AllowanceMetric[];

    for (const metric of metrics) {
      const check = await checkAllowance({ workspaceId, metric, amount: 0 });

      // Un cupo declarado en cero es una capacidad que el plan no incluye: no
      // es un limite alcanzado, es algo que el cliente nunca compro.
      if (check.limit === 0) continue;

      // `exhausted` distingue existencias de consumo: tener 1 numero de 1
      // permitido es normal, gastar 500 conversaciones de 500 no lo es.
      // Tratarlos igual llenaba el panel de alertas criticas por workspaces
      // sanos, que es la forma mas rapida de que se dejen de leer.
      const exceeded = check.exhausted;
      const near = !exceeded && check.percent >= NEAR_LIMIT_PERCENT;

      await track(exceeded, {
        kind: AlertKind.ALLOWANCE_EXCEEDED,
        severity: AlertSeverity.CRITICAL,
        title: `${check.label}: cupo agotado`,
        detail: `${check.used} de ${check.limit}. ${
          entitlements.plan.overages[metric] !== undefined
            ? 'Lo que siga se cobra como excedente.'
            : 'Lo que siga queda bloqueado hasta el proximo periodo.'
        }`,
        dedupeKey: `allowance-exceeded:${metric}`,
      });

      await track(near, {
        kind: AlertKind.ALLOWANCE_NEAR_LIMIT,
        severity: AlertSeverity.WARNING,
        title: `${check.label}: ${check.percent}% del cupo`,
        detail: `${check.used} de ${check.limit}.`,
        dedupeKey: `allowance-near:${metric}`,
      });
    }

    await track(!entitlements.active, {
      kind: AlertKind.SUBSCRIPTION_EXPIRED,
      severity: AlertSeverity.CRITICAL,
      title: 'La suscripcion no esta vigente',
      detail: 'El consumo queda bloqueado hasta regularizar el pago.',
      dedupeKey: 'subscription-expired',
    });
  }

  return { raised: raised.length, resolved: resolved.length, keys: { raised, resolved } };
}
