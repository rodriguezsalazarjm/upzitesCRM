import { WorkspaceRole } from '../../../generated/prisma/enums';
import type { FeatureKey, LimitKey } from '../entitlements/config';

/**
 * Tareas posibles del checklist de puesta en marcha (P0-E). El preset elige
 * cuales son relevantes; el plan decide si estan disponibles; el avance se
 * CALCULA del estado real (ver `evaluate.ts`), nunca se marca a mano.
 */
export const CHECKLIST_TASK_IDS = [
  'setup_profile',
  'connect_whatsapp',
  'connect_instagram',
  'import_contacts',
  'create_opportunity',
  'setup_quotes',
  'create_product',
  'setup_recovery',
  'create_automation',
  'setup_ai',
  'first_lead',
  'first_sale',
  'invite_team',
] as const;
export type ChecklistTaskId = (typeof CHECKLIST_TASK_IDS)[number];

export type ChecklistRequirement = { feature: FeatureKey } | { limit: LimitKey; min: number };

export type ChecklistTaskDef = {
  id: ChecklistTaskId;
  label: string;
  description: string;
  href: string;
  requires?: ChecklistRequirement;
  /** Rol minimo para HACERLA. Quien no lo tiene la ve como "la completa un owner o admin", sin enlace. */
  minRole?: WorkspaceRole;
};

export const CHECKLIST_TASKS: Record<ChecklistTaskId, ChecklistTaskDef> = {
  setup_profile: {
    id: 'setup_profile',
    label: 'Configura tu negocio',
    description: 'Cuéntanos qué haces para ordenar el CRM a tu medida.',
    href: '/bienvenida',
    // Solo OWNER/ADMIN configura el perfil (ver workspace-profile/service).
    minRole: WorkspaceRole.ADMIN,
  },
  connect_whatsapp: {
    id: 'connect_whatsapp',
    label: 'Conecta WhatsApp',
    description: 'Recibe y responde conversaciones desde el Inbox.',
    href: '/integraciones',
    requires: { feature: 'channels.messaging' },
  },
  connect_instagram: {
    id: 'connect_instagram',
    label: 'Conecta Instagram',
    description: 'Centraliza los mensajes directos de Instagram.',
    href: '/integraciones',
    requires: { feature: 'channels.messaging' },
  },
  import_contacts: {
    id: 'import_contacts',
    label: 'Agrega tus contactos',
    description: 'Crea o importa tus primeros contactos.',
    href: '/contactos',
  },
  create_opportunity: {
    id: 'create_opportunity',
    label: 'Crea tu primera oportunidad',
    description: 'Sigue cada venta en el pipeline.',
    href: '/oportunidades',
  },
  setup_quotes: {
    id: 'setup_quotes',
    label: 'Crea tu primera cotización',
    description: 'Envía propuestas con precio desde el CRM.',
    href: '/cotizaciones',
    requires: { feature: 'quotes' },
  },
  create_product: {
    id: 'create_product',
    label: 'Crea un producto',
    description: 'Publica lo que vendes con su precio.',
    href: '/productos',
    requires: { feature: 'commerce.products' },
  },
  setup_recovery: {
    id: 'setup_recovery',
    label: 'Configura la recuperación',
    description: 'Activa un seguimiento para carritos abandonados.',
    href: '/recuperacion',
    requires: { feature: 'recovery' },
  },
  create_automation: {
    id: 'create_automation',
    label: 'Crea una automatización',
    description: 'Deja que las tareas repetitivas se hagan solas.',
    href: '/automatizaciones',
  },
  // P16: pasos 6 y 8 del onboarding (IA y primer resultado), calculados del estado real.
  setup_ai: {
    id: 'setup_ai',
    label: 'Configura tu asistente IA',
    description: 'Publica un agente que responda y venda por ti.',
    href: '/ia/agente',
    requires: { feature: 'agents' },
    minRole: WorkspaceRole.ADMIN,
  },
  first_lead: {
    id: 'first_lead',
    label: 'Recibe tu primer lead',
    description: 'Comparte tu canal: la primera conversación llega al Inbox.',
    href: '/inbox',
  },
  first_sale: {
    id: 'first_sale',
    label: 'Consigue tu primera venta',
    description: 'Comparte tu producto: el primer pedido pagado aparece en Pedidos.',
    href: '/pedidos',
    requires: { feature: 'commerce.orders' },
  },
  // P0-F: Configuracion → Equipo. Requiere un plan con mas de 1 usuario y
  // rol OWNER/ADMIN (quien invita). Con teamSize SOLO no es relevante.
  invite_team: {
    id: 'invite_team',
    label: 'Invita a tu equipo',
    description: 'Suma a las personas que atienden contigo.',
    href: '/configuracion/equipo',
    requires: { limit: 'users.max', min: 2 },
    minRole: WorkspaceRole.ADMIN,
  },
};
