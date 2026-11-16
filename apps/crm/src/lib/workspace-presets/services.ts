import type { WorkspacePreset } from './types';

/** Servicios: se vende cotizando; el pipeline es el centro. */
export const servicesPreset: WorkspacePreset = {
  key: 'services',
  version: 1,
  label: 'Servicios',
  description: 'Captura clientes, cotiza y sigue cada oportunidad en el pipeline.',
  businessType: 'SERVICES',
  navigationOrder: ['home', 'inbox', 'contacts', 'pipeline', 'quotes', 'activities', 'automations', 'ai', 'analytics'],
  defaultHiddenItems: ['orders', 'products', 'recovery'],
  dashboardWidgets: ['new_contacts', 'open_opportunities', 'pipeline_value', 'quotes_pending', 'unread_messages', 'automation_activity'],
  onboardingChecklist: ['setup_profile', 'connect_whatsapp', 'import_contacts', 'create_opportunity', 'setup_quotes', 'create_automation', 'invite_team'],
  recommendedIntegrations: ['whatsapp', 'instagram', 'messenger'],
  recommendedAutomations: ['nuevo-lead-tarea', 'seguimiento-2h', 'silencio-3-dias'],
  recommendedTemplates: ['qualification', 'quote', 'faq'],
  primaryAction: { label: 'Nueva oportunidad', href: '/oportunidades' },
  terms: { contacts: 'Leads y clientes' },
};
