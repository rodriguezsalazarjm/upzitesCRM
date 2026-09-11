import { ActivationStatus, UserRole } from '../../../generated/prisma/client';
import { recordAudit } from '../domain/audit';
import { prisma } from '../prisma';
import { getOnboardingState } from './steps';

/**
 * Activacion del workspace.
 *
 * Activar no es marcar una casilla: es la linea a partir de la cual el agente
 * atiende clientes reales sin que nadie mire. Por eso se comprueban los
 * requisitos **en el momento de activar** y no se confia en lo que el wizard
 * mostro hace diez minutos.
 */

export class ActivationError extends Error {
  constructor(
    message: string,
    readonly code: 'FORBIDDEN' | 'INCOMPLETE' | 'ALREADY_ACTIVE',
    readonly blockers: string[] = [],
  ) {
    super(message);
    this.name = 'ActivationError';
  }
}

/** Solo el owner activa: es quien responde por lo que el agente diga. */
export function canActivate(role: UserRole) {
  return role === UserRole.OWNER;
}

export async function activateWorkspace(input: {
  workspaceId: string;
  actorId: string;
  role: UserRole;
}) {
  if (!canActivate(input.role)) {
    throw new ActivationError('Solo el owner puede activar el workspace.', 'FORBIDDEN');
  }

  const state = await getOnboardingState(input.workspaceId);

  if (state.status === ActivationStatus.ACTIVE) {
    throw new ActivationError('El workspace ya esta activo.', 'ALREADY_ACTIVE');
  }

  if (!state.canActivate) {
    throw new ActivationError(
      'Faltan pasos obligatorios del onboarding.',
      'INCOMPLETE',
      state.blockers,
    );
  }

  const activation = await prisma.workspaceActivation.upsert({
    where: { workspaceId: input.workspaceId },
    create: {
      workspaceId: input.workspaceId,
      status: ActivationStatus.ACTIVE,
      activatedAt: new Date(),
      activatedById: input.actorId,
    },
    update: {
      status: ActivationStatus.ACTIVE,
      activatedAt: new Date(),
      activatedById: input.actorId,
      note: null,
    },
  });

  await recordAudit({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: 'workspace.activated',
    entity: 'WorkspaceActivation',
    entityId: activation.id,
    metadata: { businessType: state.businessType, steps: state.total },
  });

  return activation;
}

/**
 * Suspende el workspace.
 *
 * **Conserva los datos y las inscripciones.** Suspender es un freno, no un
 * borrado: la spec pide poder apagar la IA sin detener el CRM, y un cliente que
 * vuelve tiene que encontrar su historial donde lo dejo.
 */
export async function suspendWorkspace(input: {
  workspaceId: string;
  actorId: string;
  role: UserRole;
  note: string;
}) {
  if (!canActivate(input.role)) {
    throw new ActivationError('Solo el owner puede suspender el workspace.', 'FORBIDDEN');
  }

  const activation = await prisma.workspaceActivation.upsert({
    where: { workspaceId: input.workspaceId },
    create: {
      workspaceId: input.workspaceId,
      status: ActivationStatus.SUSPENDED,
      note: input.note,
    },
    update: { status: ActivationStatus.SUSPENDED, note: input.note },
  });

  await recordAudit({
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    action: 'workspace.suspended',
    entity: 'WorkspaceActivation',
    entityId: activation.id,
    metadata: { note: input.note },
  });

  return activation;
}

/**
 * Si el workspace esta operativo.
 *
 * Lo consultan el agente y los journeys: mientras no se active, la IA no
 * responde sola y la recuperacion no escribe. Lo que sigue funcionando es el
 * CRM —el equipo puede usar el inbox y cargar contactos—, que es justamente lo
 * que hace util el periodo de configuracion.
 */
export async function isWorkspaceActive(workspaceId: string) {
  const activation = await prisma.workspaceActivation.findUnique({
    where: { workspaceId },
    select: { status: true },
  });

  return activation?.status === ActivationStatus.ACTIVE;
}
