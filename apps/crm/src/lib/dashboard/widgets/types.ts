import type { FeatureKey } from '../../entitlements/config';
import type { CanonicalBusinessType } from '../../workspace-profile/business';

/**
 * Widgets del dashboard (P0-E). Cada widget declara de donde salen sus datos
 * (`loader`) y solo existe si hay una fuente real hoy: ninguna metrica
 * inventada.
 */

export const WIDGET_IDS = [
  'new_contacts',
  'unread_messages',
  'automation_activity',
  'open_opportunities',
  'pipeline_value',
  'quotes_pending',
  'sales_won',
  'orders_today',
  'revenue_today',
  'top_products',
  'recovered_sales',
  'ai_usage',
] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

export type WidgetSize = 'sm' | 'md' | 'lg';
export const WIDGET_SIZES: readonly WidgetSize[] = ['sm', 'md', 'lg'];

/** Lo que devuelve un loader. `kind` decide como se dibuja. */
export type WidgetData =
  | { kind: 'stat'; value: number; format: 'number' | 'money'; hint?: string; href?: string }
  | { kind: 'list'; rows: { label: string; value: number; format: 'number' | 'money' }[]; href?: string };

/**
 * El loader recibe SOLO el workspaceId del contexto verificado del servidor.
 * Nunca un workspaceId del cliente.
 */
export type WidgetContext = { workspaceId: string; now: Date; currency: string; timeZone: string };

export type WidgetDef = {
  id: WidgetId;
  title: string;
  description: string;
  defaultSize: WidgetSize;
  /** Funcion del plan necesaria. Sin ella el widget se muestra bloqueado y NO se carga. */
  requiredEntitlement?: FeatureKey;
  /** Tipos de negocio donde tiene sentido. Sin valor = todos. */
  supportedBusinessTypes?: CanonicalBusinessType[];
  emptyState: string;
  loader: (ctx: WidgetContext) => Promise<WidgetData>;
};

/** Una entrada del layout personal (WorkspaceUserPreference.dashboardLayout). */
export type DashboardLayoutEntry = { id: WidgetId; position: number; size: WidgetSize; hidden: boolean };
