export class WhatsAppChannelOwnershipError extends Error {
  constructor() {
    super('CHANNEL_TAKEN');
    this.name = 'WhatsAppChannelOwnershipError';
  }
}

export function assertWhatsAppChannelOwnership(
  existingWorkspaceId: string | null | undefined,
  requestedWorkspaceId: string,
) {
  if (existingWorkspaceId && existingWorkspaceId !== requestedWorkspaceId) {
    throw new WhatsAppChannelOwnershipError();
  }
}

/** P2002 cubre la carrera en que ambos tenants leyeron antes del primer INSERT. */
export function isWhatsAppChannelOwnershipConflict(error: unknown) {
  return (
    error instanceof WhatsAppChannelOwnershipError || (error as { code?: string })?.code === 'P2002'
  );
}
