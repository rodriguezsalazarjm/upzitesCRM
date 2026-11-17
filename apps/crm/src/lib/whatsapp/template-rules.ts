import { WhatsAppTemplateStatus, type WhatsAppTemplateCategory } from '../../../generated/prisma/enums';
import { MESSAGE_VARIABLES, type MessageVariable } from '../followups/rules';

/** P26: reglas puras de plantillas (sin base de datos): usables en tests y en el cliente. */

type TemplateRow = { name: string; status: WhatsAppTemplateStatus; channelId: string; body: string; variables: string[] };

export const TEMPLATE_STATUS_LABEL: Record<WhatsAppTemplateStatus, string> = {
  PENDING: 'En revisión',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  PAUSED: 'Pausada por Meta',
  DISABLED: 'Deshabilitada',
};
export const TEMPLATE_CATEGORY_LABEL: Record<WhatsAppTemplateCategory, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utilidad',
  AUTHENTICATION: 'Autenticación',
};

const PLACEHOLDER = /\{\{\s*(\d+)\s*\}\}/g;
const NAMED = /\{\{\s*([a-z]+)\s*\}\}/g;

/** Cantidad de variables {{n}} del cuerpo, o error si no son 1..n consecutivas. */
export function placeholderCount(body: string): number | { error: string } {
  const numbers = new Set([...body.matchAll(PLACEHOLDER)].map((m) => Number(m[1])));
  const max = numbers.size ? Math.max(...numbers) : 0;
  for (let n = 1; n <= max; n += 1) if (!numbers.has(n)) return { error: `Falta la variable {{${n}}}: deben ir de {{1}} en adelante sin saltos.` };
  return max;
}

/** "Hola {{nombre}}" → { body: "Hola {{1}}", variables: ["nombre"] }. Un mismo nombre reusa su numero. */
export function toMetaBody(text: string) {
  const variables: MessageVariable[] = [];
  const unknown: string[] = [];
  const body = text.replace(NAMED, (whole, name: string) => {
    if (!(name in MESSAGE_VARIABLES)) {
      unknown.push(name);
      return whole;
    }
    let index = variables.indexOf(name as MessageVariable);
    if (index < 0) index = variables.push(name as MessageVariable) - 1;
    return `{{${index + 1}}}`;
  });
  return { body, variables, unknown };
}

export type TemplateValues = Partial<Record<MessageVariable, string | null | undefined>>;

/** Texto final y parametros en orden para Meta. Un dato vacio impide el envio. */
export function renderTemplate(template: Pick<TemplateRow, 'body' | 'variables'>, values: TemplateValues) {
  const params: string[] = [];
  for (const name of template.variables) {
    const value = values[name as MessageVariable]?.trim();
    if (!value) return { ok: false as const, reason: `falta el dato {{${name}}} para la plantilla` };
    params.push(value);
  }
  const text = template.body.replace(PLACEHOLDER, (_w, n: string) => params[Number(n) - 1] ?? '');
  return { ok: true as const, text, params };
}

/** Por que una plantilla no sirve para este envio, o null si sirve. Es el "fallback" de P26: nunca se manda otra cosa. */
export function templateUnusableReason(template: TemplateRow, channelId: string | null) {
  if (template.status !== WhatsAppTemplateStatus.APPROVED) return `la plantilla «${template.name}» no está aprobada por Meta (${TEMPLATE_STATUS_LABEL[template.status]})`;
  if (!channelId || template.channelId !== channelId) return `la plantilla «${template.name}» es de otro número de WhatsApp`;
  const count = placeholderCount(template.body);
  if (typeof count !== 'number' || count !== template.variables.length) return `la plantilla «${template.name}» tiene variables sin asignar a un dato del CRM`;
  return null;
}

export function mapMetaStatus(raw: string | undefined): WhatsAppTemplateStatus {
  switch ((raw ?? '').toUpperCase()) {
    case 'APPROVED':
    case 'REINSTATED':
    case 'FLAGGED': // sigue enviable; Meta avisa que puede pausarla
      return WhatsAppTemplateStatus.APPROVED;
    case 'REJECTED':
      return WhatsAppTemplateStatus.REJECTED;
    case 'PAUSED':
      return WhatsAppTemplateStatus.PAUSED;
    case 'DISABLED':
    case 'DELETED':
    case 'PENDING_DELETION':
    case 'ARCHIVED':
      return WhatsAppTemplateStatus.DISABLED;
    default:
      return WhatsAppTemplateStatus.PENDING;
  }
}

