export const QUOTE_STATUS: Record<string, { label: string; variant: 'outline' | 'info' | 'warning' | 'success' | 'danger' }> = {
  DRAFT: { label: 'Borrador', variant: 'outline' }, READY: { label: 'Lista', variant: 'info' }, SENT: { label: 'Enviada', variant: 'warning' }, VIEWED: { label: 'Vista', variant: 'warning' },
  ACCEPTED: { label: 'Aceptada', variant: 'success' }, REJECTED: { label: 'Rechazada', variant: 'danger' }, EXPIRED: { label: 'Vencida', variant: 'danger' }, CANCELLED: { label: 'Cancelada', variant: 'outline' },
};
