import { CommerceSubtype } from '../../../generated/prisma/enums';
import type { WorkspacePreset } from './types';

/**
 * Infoproductos (ECOMMERCE + INFOPRODUCT): cursos, guias, contenido digital.
 * Se entrega tras el pago: pedidos, productos y recuperacion por delante.
 */
export const infoproductPreset: WorkspacePreset = {
  key: 'infoproduct',
  version: 1,
  label: 'Infoproductos',
  description: 'Vende productos digitales, entrega tras el pago y recupera ventas.',
  businessType: 'ECOMMERCE',
  commerceSubtype: CommerceSubtype.INFOPRODUCT,
  navigationOrder: ['home', 'inbox', 'orders', 'products', 'contacts', 'recovery', 'automations', 'ai', 'analytics'],
  defaultHiddenItems: ['pipeline', 'quotes', 'activities'],
  dashboardWidgets: ['orders_today', 'revenue_today', 'top_products', 'recovered_sales', 'unread_messages', 'automation_activity'],
  onboardingChecklist: ['setup_profile', 'connect_whatsapp', 'connect_instagram', 'create_product', 'setup_recovery', 'create_automation'],
  recommendedIntegrations: ['whatsapp', 'instagram', 'mercado_pago'],
  recommendedAutomations: ['pago-limpia-seguimientos', 'silencio-3-dias', 'opt-out-limpieza'],
};
