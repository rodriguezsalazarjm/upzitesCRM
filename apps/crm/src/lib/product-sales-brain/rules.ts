import { z } from 'zod';

export const BRAIN_TEXT_MAX = 4_000;
export const BRAIN_SPECIAL_MAX = 8_000;
export const BRAIN_ITEM_MAX = 1_000;
export const BRAIN_LIST_MAX = 30;

const text = (max = BRAIN_TEXT_MAX) => z.string().max(max).transform((value) => value.trim() || null);

export const faqSchema = z.object({ question: z.string().trim().min(1).max(BRAIN_ITEM_MAX), answer: z.string().trim().min(1).max(BRAIN_ITEM_MAX) }).strict();
export const objectionSchema = z.object({ objection: z.string().trim().min(1).max(BRAIN_ITEM_MAX), response: z.string().trim().min(1).max(BRAIN_ITEM_MAX) }).strict();
/** El modelo no elige producto, tenant, precio ni moneda: todo sale del contexto. */
export const activeProductCheckoutArgsSchema = z.object({}).strict();

export const productSalesBrainInputSchema = z.object({
  productWhat: text(),
  idealFor: text(),
  problems: text(),
  benefits: text(),
  differentiators: text(),
  targetAudience: text(),
  buyerPersona: text(),
  faqs: z.array(faqSchema).max(BRAIN_LIST_MAX),
  objections: z.array(objectionSchema).max(BRAIN_LIST_MAX),
  socialProof: text(),
  guarantee: text(),
  policies: text(),
  salesTone: text(),
  prohibitedClaims: text(),
  askWhen: text(),
  offerWhen: text(),
  checkoutWhen: text(),
  insistWhen: text(),
  stopWhen: text(),
  handoffWhen: text(),
  specialInstructions: text(BRAIN_SPECIAL_MAX),
}).strict();

export type ProductSalesBrainInput = z.infer<typeof productSalesBrainInputSchema>;
export type ProductSalesBrainDraft = z.input<typeof productSalesBrainInputSchema>;
export type TrainingStatus = 'EMPTY' | 'PARTIAL' | 'READY';

export function trainingStatus(brain: ProductSalesBrainInput | null): TrainingStatus {
  if (!brain) return 'EMPTY';
  const any = Object.entries(brain).some(([, value]) => Array.isArray(value) ? value.length > 0 : Boolean(value));
  if (!any) return 'EMPTY';
  const essentials = [brain.productWhat, brain.targetAudience, brain.benefits, brain.salesTone, brain.checkoutWhen];
  return essentials.every(Boolean) && (brain.faqs.length > 0 || brain.objections.length > 0) ? 'READY' : 'PARTIAL';
}

export function parseBrainLists(brain: { faqs: unknown; objections: unknown }) {
  return {
    faqs: z.array(faqSchema).safeParse(brain.faqs).data ?? [],
    objections: z.array(objectionSchema).safeParse(brain.objections).data ?? [],
  };
}
