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

export const quoteStatusTone: Record<string, StatusTone> = {
  DRAFT: 'draft',
  CALCULATED: 'warning',
  PENDING_HUMAN_REVIEW: 'warning',
  APPROVED: 'success',
  SENT: 'info',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'neutral',
};

export const quoteStatusLabel: Record<string, string> = {
  DRAFT: 'Borrador',
  CALCULATED: 'Calculada',
  PENDING_HUMAN_REVIEW: 'En revisión',
  APPROVED: 'Aprobada',
  SENT: 'Enviada',
  ACCEPTED: 'Aceptada',
  REJECTED: 'Rechazada',
  EXPIRED: 'Vencida',
};

export const orderStatusTone: Record<string, StatusTone> = {
  DRAFT: 'draft',
  PENDING_PAYMENT: 'warning',
  CONFIRMED: 'success',
  PROCESSING: 'info',
  FULFILLED: 'success',
  CANCELLED: 'neutral',
  REFUNDED: 'danger',
};

export const orderStatusLabel: Record<string, string> = {
  DRAFT: 'Borrador',
  PENDING_PAYMENT: 'Esperando pago',
  CONFIRMED: 'Confirmado',
  PROCESSING: 'En proceso',
  FULFILLED: 'Entregado',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Devuelto',
};

export const paymentStatusTone: Record<string, StatusTone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
  REFUNDED: 'danger',
};

export const paymentStatusLabel: Record<string, string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Pagado',
  REJECTED: 'Rechazado',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Devuelto',
};

export const deliveryStatusTone: Record<string, StatusTone> = {
  GRANTED: 'info',
  SENT: 'info',
  ACCESSED: 'success',
  REVOKED: 'danger',
  EXPIRED: 'neutral',
};

export const deliveryStatusLabel: Record<string, string> = {
  GRANTED: 'Otorgado',
  SENT: 'Enviado',
  ACCESSED: 'Accedido',
  REVOKED: 'Revocado',
  EXPIRED: 'Vencido',
};
