/**
 * Ayudas contextuales ligeras (P0-E). No es un tour: cada pagina muestra un
 * consejo la primera vez; la persona lo descarta y queda descartado SOLO para
 * ella y SOLO en ese workspace (WorkspaceUserPreference.dismissedTutorials).
 */
export const TUTORIAL_KEYS = ['pipeline.first_visit', 'automation.first_visit', 'products.first_visit', 'inbox.first_visit'] as const;
export type TutorialKey = (typeof TUTORIAL_KEYS)[number];

export function isTutorialKey(value: unknown): value is TutorialKey {
  return typeof value === 'string' && (TUTORIAL_KEYS as readonly string[]).includes(value);
}

export const TUTORIALS: Record<TutorialKey, { title: string; body: string }> = {
  'pipeline.first_visit': {
    title: 'Tu pipeline',
    body: 'Cada columna es una etapa de venta. Avanza cada oportunidad de etapa a medida que progresa; al ganarla, cuenta en tus ventas del mes.',
  },
  'automation.first_visit': {
    title: 'Automatizaciones',
    body: 'Empieza por una plantilla: se activa con un evento (un lead nuevo, un pago) y hace el trabajo repetitivo por ti.',
  },
  'products.first_visit': {
    title: 'Tus productos',
    body: 'Crea un producto con su precio. Los digitales se entregan cuando el pago se confirma.',
  },
  'inbox.first_visit': {
    title: 'Inbox',
    body: 'Aquí llegan WhatsApp, Instagram y Facebook en un solo lugar. Asigna conversaciones para que nadie quede sin respuesta.',
  },
};

/** Pura: la preferencia es la del usuario ACTUAL en el workspace ACTIVO. */
export function shouldShowTutorial(preference: { dismissedTutorials?: string[] | null } | null | undefined, key: TutorialKey) {
  return !(preference?.dismissedTutorials ?? []).includes(key);
}
