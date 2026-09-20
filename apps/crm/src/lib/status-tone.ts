import type { StatusTone } from '@/components/ui/status-badge';
import type { ContactStatus, OpportunityStage } from '@/lib/mock-data';

/** Mapas dominio → tono visual. Un solo lugar para que cada estado se vea igual en todo el CRM. */

export const stageTone: Record<OpportunityStage, StatusTone> = {
  nuevo: 'neutral',
  calificado: 'info',
  propuesta: 'ink',
  negociacion: 'warning',
  ganado: 'success',
  perdido: 'danger',
};

export const contactStatusTone: Record<ContactStatus, StatusTone> = {
  lead: 'info',
  activo: 'ink',
  cliente: 'success',
  inactivo: 'neutral',
};

export const contactStatusLabel: Record<ContactStatus, string> = {
  lead: 'Lead',
  activo: 'Activo',
  cliente: 'Cliente',
  inactivo: 'Inactivo',
};
