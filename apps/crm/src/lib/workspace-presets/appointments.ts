import type { WorkspacePreset } from './types';

/**
 * Citas. TODAVIA no existe un modulo de agenda: el preset usa solo modulos
 * reales (sin pantalla falsa de "Agenda"). Cuando exista, entra aqui con una
 * nueva version del preset.
 */
export const appointmentsPreset: WorkspacePreset = {
  key: 'appointments',
  version: 1,
  label: 'Citas',
  description: 'Conversa con tus clientes y automatiza recordatorios y seguimientos.',
  businessType: 'APPOINTMENTS',
  navigationOrder: ['home', 'inbox', 'contacts', 'automations', 'ai'],
  defaultHiddenItems: ['orders', 'products', 'recovery', 'quotes'],
  // Solo widgets con datos reales hoy para este tipo de negocio.
  dashboardWidgets: ['new_contacts', 'unread_messages', 'automation_activity'],
  onboardingChecklist: ['setup_profile', 'connect_whatsapp', 'import_contacts', 'create_automation', 'invite_team'],
  recommendedIntegrations: ['whatsapp', 'instagram'],
  recommendedAutomations: ['nuevo-lead-tarea', 'silencio-3-dias'],
};
