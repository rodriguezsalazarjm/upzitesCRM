import { loadAiUsage } from './loaders/ai';
import { loadNewContacts, loadUnreadMessages, loadAutomationActivity } from './loaders/common';
import { loadOrdersToday, loadRecoveredSales, loadRevenueToday, loadTopProducts } from './loaders/commerce';
import { loadOpenOpportunities, loadPipelineValue, loadQuotesPending, loadSalesWon } from './loaders/services';
import type { WidgetDef, WidgetId } from './types';

/**
 * Registro de widgets (P0-E). Agregar un widget = una entrada aqui con un
 * loader sobre datos que ya existen. El dashboard no conoce widgets concretos.
 */
export const WIDGET_REGISTRY: Record<WidgetId, WidgetDef> = {
  new_contacts: {
    id: 'new_contacts',
    title: 'Contactos nuevos',
    description: 'Contactos creados en los últimos 7 días.',
    defaultSize: 'sm',
    emptyState: 'Aún no llegan contactos esta semana.',
    loader: loadNewContacts,
  },
  unread_messages: {
    id: 'unread_messages',
    title: 'Mensajes sin leer',
    description: 'Mensajes pendientes en conversaciones abiertas.',
    defaultSize: 'sm',
    emptyState: 'Estás al día.',
    loader: loadUnreadMessages,
  },
  automation_activity: {
    id: 'automation_activity',
    title: 'Automatizaciones',
    description: 'Ejecuciones completadas en los últimos 7 días.',
    defaultSize: 'sm',
    emptyState: 'Todavía no se ejecutó ninguna automatización.',
    loader: loadAutomationActivity,
  },
  open_opportunities: {
    id: 'open_opportunities',
    title: 'Oportunidades abiertas',
    description: 'Oportunidades en curso en el pipeline.',
    defaultSize: 'sm',
    supportedBusinessTypes: ['SERVICES', 'APPOINTMENTS', 'GENERAL', 'UNDEFINED'],
    emptyState: 'Crea tu primera oportunidad.',
    loader: loadOpenOpportunities,
  },
  pipeline_value: {
    id: 'pipeline_value',
    title: 'Valor del pipeline',
    description: 'Suma del valor de las oportunidades abiertas.',
    defaultSize: 'sm',
    supportedBusinessTypes: ['SERVICES', 'APPOINTMENTS', 'GENERAL', 'UNDEFINED'],
    emptyState: 'Sin oportunidades abiertas.',
    loader: loadPipelineValue,
  },
  quotes_pending: {
    id: 'quotes_pending',
    title: 'Cotizaciones pendientes',
    description: 'Cotizaciones enviadas que esperan respuesta.',
    defaultSize: 'sm',
    requiredEntitlement: 'quotes',
    supportedBusinessTypes: ['SERVICES', 'GENERAL', 'UNDEFINED'],
    emptyState: 'No hay cotizaciones esperando respuesta.',
    loader: loadQuotesPending,
  },
  sales_won: {
    id: 'sales_won',
    title: 'Ventas ganadas',
    description: 'Valor de oportunidades ganadas este mes.',
    defaultSize: 'sm',
    supportedBusinessTypes: ['SERVICES', 'APPOINTMENTS', 'GENERAL', 'UNDEFINED'],
    emptyState: 'Aún no hay ventas ganadas este mes.',
    loader: loadSalesWon,
  },
  orders_today: {
    id: 'orders_today',
    title: 'Pedidos de hoy',
    description: 'Pedidos pagados o en curso creados hoy.',
    defaultSize: 'sm',
    requiredEntitlement: 'commerce.orders',
    supportedBusinessTypes: ['ECOMMERCE', 'GENERAL', 'UNDEFINED'],
    emptyState: 'Todavía no hay pedidos hoy.',
    loader: loadOrdersToday,
  },
  revenue_today: {
    id: 'revenue_today',
    title: 'Ventas de hoy',
    description: 'Monto de los pedidos de hoy.',
    defaultSize: 'sm',
    requiredEntitlement: 'commerce.orders',
    supportedBusinessTypes: ['ECOMMERCE', 'GENERAL', 'UNDEFINED'],
    emptyState: 'Sin ventas hoy.',
    loader: loadRevenueToday,
  },
  top_products: {
    id: 'top_products',
    title: 'Productos más vendidos',
    description: 'Top 5 por monto en los últimos 30 días.',
    defaultSize: 'md',
    requiredEntitlement: 'commerce.orders',
    supportedBusinessTypes: ['ECOMMERCE', 'GENERAL', 'UNDEFINED'],
    emptyState: 'Cuando vendas, aquí verás tus productos estrella.',
    loader: loadTopProducts,
  },
  recovered_sales: {
    id: 'recovered_sales',
    title: 'Ventas recuperadas',
    description: 'Checkouts abandonados recuperados en 30 días.',
    defaultSize: 'sm',
    requiredEntitlement: 'recovery',
    supportedBusinessTypes: ['ECOMMERCE', 'GENERAL', 'UNDEFINED'],
    emptyState: 'Activa la recuperación para ver resultados.',
    loader: loadRecoveredSales,
  },
  ai_usage: {
    id: 'ai_usage',
    title: 'Uso de IA',
    description: 'Créditos de IA consumidos este mes.',
    defaultSize: 'sm',
    requiredEntitlement: 'ai',
    emptyState: 'La IA no se ha usado este mes.',
    loader: loadAiUsage,
  },
};
