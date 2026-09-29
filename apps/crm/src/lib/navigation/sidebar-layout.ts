/**
 * Medidas del sidebar (P0-E). Puras: las usan el componente y los tests.
 * El ancho guardado es SOLO de escritorio; en movil manda el drawer fijo.
 */
export const SIDEBAR = {
  defaultWidth: 260,
  minWidth: 220,
  maxWidth: 340,
  collapsedWidth: 72,
  mobileWidth: 248,
} as const;

export function clampSidebarWidth(width: number | null | undefined) {
  if (typeof width !== 'number' || !Number.isFinite(width)) return SIDEBAR.defaultWidth;
  return Math.min(SIDEBAR.maxWidth, Math.max(SIDEBAR.minWidth, Math.round(width)));
}

export function sidebarWidthFor(
  preference: { sidebarWidth?: number | null; sidebarCollapsed?: boolean | null } | null | undefined,
  viewport: { mobile: boolean },
) {
  if (viewport.mobile) return SIDEBAR.mobileWidth;
  if (preference?.sidebarCollapsed) return SIDEBAR.collapsedWidth;
  return clampSidebarWidth(preference?.sidebarWidth);
}
