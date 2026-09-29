import { usageFor } from '../../../entitlements';
import type { WidgetContext, WidgetData } from '../types';

/** Creditos de IA consumidos este mes (contador real de P0-C). */
export async function loadAiUsage({ workspaceId, now }: WidgetContext): Promise<WidgetData> {
  const value = await usageFor(workspaceId, 'ai.credits', undefined, now);
  return { kind: 'stat', value, format: 'number', hint: 'Créditos usados este mes', href: '/uso' };
}
