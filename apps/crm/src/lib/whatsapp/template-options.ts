import type { TemplateOption } from '@/components/followups/strategy-editor';
import { listTemplates, TEMPLATE_STATUS_LABEL, templateUnusableReason } from './templates';

/** P26: plantillas para el selector de pasos. El numero real se comprueba al enviar. */
export async function templateOptions(workspaceId: string): Promise<TemplateOption[]> {
  const templates = await listTemplates(workspaceId);
  return templates.map((t) => ({
    id: t.id,
    label: `${t.name} (${t.language}) · ${t.channel.label || t.channel.displayPhoneNumber}`,
    statusLabel: TEMPLATE_STATUS_LABEL[t.status],
    problem: templateUnusableReason(t, t.channelId),
    usesProduct: t.variables.includes('producto'),
  }));
}
