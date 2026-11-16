import type { WorkspacePreset } from './types';

/** Fallback: negocio sin configurar u "Otro". No oculta nada. */
export const generalPreset: WorkspacePreset = {
  key: 'general',
  version: 1,
  label: 'General',
  description: 'Una base equilibrada para empezar.',
  businessType: 'GENERAL',
  navigationOrder: ['home', 'inbox', 'contacts', 'pipeline', 'automations', 'ai'],
  defaultHiddenItems: [],
  dashboardWidgets: ['new_contacts', 'unread_messages', 'automation_activity'],
  onboardingChecklist: ['setup_profile', 'connect_whatsapp', 'import_contacts', 'setup_ai', 'create_automation', 'first_lead', 'invite_team'],
  recommendedIntegrations: ['whatsapp'],
  recommendedAutomations: ['nuevo-lead-tarea'],
  recommendedTemplates: ['faq', 'keyword', 'handoff'],
  primaryAction: { label: 'Nuevo contacto', href: '/contactos/nuevo' },
};
