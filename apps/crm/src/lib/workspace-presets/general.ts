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
  onboardingChecklist: ['setup_profile', 'connect_whatsapp', 'import_contacts', 'create_automation'],
  recommendedIntegrations: ['whatsapp'],
  recommendedAutomations: ['nuevo-lead-tarea'],
};
