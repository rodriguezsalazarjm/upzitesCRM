import { WorkspaceRole } from '../../../generated/prisma/enums';
import type { FeatureKey } from '../entitlements/config';

/**
 * Catalogo de modulos de navegacion (P0-E). Solo modulos REALES: cada item
 * apunta a una pagina que existe hoy. Un preset ordena u oculta items de esta
 * lista; nunca inventa uno (no hay "Agenda" hasta que exista el modulo).
 *
 *  - `requires`: funcion del PLAN. Sin ella el item se ve bloqueado.
 *  - `minRole`: rol minimo en el workspace. Sin el, el item no aparece (ni
 *    siquiera como recuperable). Refleja la politica actual de cada pagina.
 *  - `system`: siempre en la seccion "Sistema", fuera del orden del preset.
 */

export type NavIcon =
  | 'rocket'
  | 'home'
  | 'inbox'
  | 'users'
  | 'pipeline'
  | 'package'
  | 'receipt'
  | 'file'
  | 'activity'
  | 'globe'
  | 'plug'
  | 'bot'
  | 'send'
  | 'megaphone'
  | 'sparkles'
  | 'book'
  | 'chart'
  | 'gauge'
  | 'card'
  | 'settings';

export type NavItemDef = {
  id: string;
  href: string;
  label: string;
  icon: NavIcon;
  requires?: FeatureKey;
  minRole?: WorkspaceRole;
  system?: boolean;
};

export const NAV_ITEMS = [
  { id: 'home', href: '/dashboard', label: 'Inicio', icon: 'home' },
  { id: 'inbox', href: '/inbox', label: 'Inbox', icon: 'inbox' },
  { id: 'contacts', href: '/contactos', label: 'Contactos', icon: 'users' },
  { id: 'pipeline', href: '/oportunidades', label: 'Pipeline', icon: 'pipeline' },
  { id: 'quotes', href: '/cotizaciones', label: 'Cotizaciones', icon: 'file', requires: 'quotes' },
  { id: 'activities', href: '/actividades', label: 'Actividades', icon: 'activity' },
  { id: 'orders', href: '/pedidos', label: 'Pedidos', icon: 'receipt', requires: 'commerce.orders' },
  { id: 'products', href: '/productos', label: 'Productos', icon: 'package', requires: 'commerce.products' },
  { id: 'recovery', href: '/recuperacion', label: 'Recuperación', icon: 'send', requires: 'campaigns.journeys' },
  { id: 'automations', href: '/automatizaciones', label: 'Automatizaciones', icon: 'bot' },
  { id: 'social', href: '/social', label: 'Social', icon: 'megaphone', requires: 'channels.messaging' },
  { id: 'ai', href: '/ia/agente', label: 'IA', icon: 'sparkles', requires: 'agents' },
  { id: 'ai_knowledge', href: '/ia/conocimiento', label: 'IA · Conocimiento', icon: 'book', requires: 'ai' },
  // P30: embudo comercial; Insights IA queda enlazado desde ahí.
  { id: 'analytics', href: '/analitica', label: 'Analítica', icon: 'chart' },
  { id: 'activation', href: '/onboarding', label: 'Puesta en marcha', icon: 'rocket', system: true },
  { id: 'sources', href: '/fuentes', label: 'Fuentes', icon: 'globe', system: true },
  // Punto 8: administracion de numeros de WhatsApp (Canales → WhatsApp).
  { id: 'channels', href: '/canales/whatsapp', label: 'Canales', icon: 'inbox', system: true },
  { id: 'integrations', href: '/integraciones', label: 'Integraciones', icon: 'plug', system: true },
  { id: 'usage', href: '/uso', label: 'Uso y costos', icon: 'gauge', system: true },
  // Solo OWNER/ADMIN puede contratar o cambiar el plan (api/billing/checkout).
  { id: 'billing', href: '/billing', label: 'Billing', icon: 'card', system: true, minRole: WorkspaceRole.ADMIN },
  { id: 'settings', href: '/configuracion', label: 'Configuración', icon: 'settings', system: true },
] as const satisfies readonly NavItemDef[];

export type NavItemId = (typeof NAV_ITEMS)[number]['id'];
export const NAV_ITEM_IDS = NAV_ITEMS.map((item) => item.id) as NavItemId[];

const BY_ID = new Map<string, NavItemDef>(NAV_ITEMS.map((item) => [item.id, item]));
export function navItem(id: string): NavItemDef | undefined {
  return BY_ID.get(id);
}
export function isNavItemId(id: string): id is NavItemId {
  return BY_ID.has(id);
}
