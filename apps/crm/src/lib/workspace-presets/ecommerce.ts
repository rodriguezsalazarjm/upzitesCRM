import type { WorkspacePreset } from './types';

/** Ecommerce (fisico, mixto o general): pedidos y productos primero. */
export const ecommercePreset: WorkspacePreset = {
  key: 'ecommerce',
  version: 1,
  label: 'Ecommerce',
  description: 'Vende productos, atiende pedidos y recupera carritos.',
  businessType: 'ECOMMERCE',
  navigationOrder: ['home', 'inbox', 'orders', 'products', 'contacts', 'recovery', 'automations', 'ai', 'analytics'],
  defaultHiddenItems: ['pipeline', 'quotes'],
  dashboardWidgets: ['orders_today', 'revenue_today', 'new_contacts', 'unread_messages', 'automation_activity'],
  onboardingChecklist: ['setup_profile', 'connect_whatsapp', 'connect_instagram', 'create_product', 'import_contacts', 'setup_ai', 'create_automation', 'setup_recovery', 'first_sale', 'invite_team'],
  recommendedIntegrations: ['whatsapp', 'instagram', 'shopify', 'mercado_pago'],
  recommendedAutomations: ['pago-limpia-seguimientos', 'mensaje-fallido-aviso', 'silencio-3-dias'],
  recommendedTemplates: ['sale', 'post-sale', 'faq'],
  primaryAction: { label: 'Nuevo producto', href: '/productos/nuevo' },
  terms: { contacts: 'Clientes' },
};
