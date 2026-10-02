import { formatMinor } from '../commerce/money';
import { parseBrainLists } from './rules';

type BrainRecord = {
  id: string; productId: string; updatedAt: Date; productWhat: string | null; idealFor: string | null;
  problems: string | null; benefits: string | null; differentiators: string | null; targetAudience: string | null;
  buyerPersona: string | null; faqs: unknown; objections: unknown; socialProof: string | null; guarantee: string | null;
  policies: string | null; salesTone: string | null; prohibitedClaims: string | null; askWhen: string | null;
  offerWhen: string | null; checkoutWhen: string | null; insistWhen: string | null; stopWhen: string | null;
  handoffWhen: string | null; specialInstructions: string | null;
};

function section(title: string, values: Array<string | null | undefined>) {
  const content = values.filter(Boolean).join('\n');
  return content ? `[${title}]\n${content}` : '';
}

export function buildProductSalesContext(input: {
  product: { id: string; name: string; description: string | null; currency: string; status: string; variants: { name: string; priceMinor: number; isActive: boolean; isDefault: boolean }[] };
  brain: BrainRecord;
}) {
  const { product, brain } = input;
  const { faqs, objections } = parseBrainLists(brain);
  const prices = product.variants.filter((item) => item.isActive).map((item) => `${item.isDefault ? product.name : item.name}: ${formatMinor(item.priceMinor, product.currency)}`);
  return [
    `PRODUCT_CONTEXT_ID=${brain.id}`,
    `ACTIVE_PRODUCT_ID=${product.id}`,
    `PRODUCT_CONTEXT_UPDATED_AT=${brain.updatedAt.toISOString()}`,
    section('PRODUCT FACTS', [`Nombre: ${product.name}`, `Estado: ${product.status}`, product.description, brain.productWhat, ...prices]),
    section('TARGET CUSTOMER', [brain.idealFor, brain.targetAudience, brain.buyerPersona]),
    section('PROBLEMS AND VALUE PROPOSITION', [brain.problems, brain.benefits, brain.differentiators]),
    section('FAQ', faqs.map((item) => `P: ${item.question}\nR: ${item.answer}`)),
    section('OBJECTIONS', objections.map((item) => `Objeción: ${item.objection}\nRespuesta sugerida: ${item.response}`)),
    section('SOCIAL PROOF', [brain.socialProof]),
    section('GUARANTEE', [brain.guarantee ?? 'No configurada. No afirmes que existe una garantía.']),
    section('POLICIES', [brain.policies ?? 'No configuradas. No inventes políticas, plazos ni devoluciones.']),
    section('SALES BEHAVIOR', [
      brain.salesTone && `Tono: ${brain.salesTone}`,
      brain.askWhen && `Cuándo preguntar: ${brain.askWhen}`,
      brain.offerWhen && `Cuándo presentar oferta: ${brain.offerWhen}`,
      brain.insistWhen && `Cuándo insistir: ${brain.insistWhen}`,
      brain.stopWhen && `Cuándo detenerse: ${brain.stopWhen}`,
    ]),
    section('PROHIBITED CLAIMS', [brain.prohibitedClaims]),
    section('CHECKOUT RULES', [brain.checkoutWhen, 'El checkout solo puede pertenecer al ACTIVE_PRODUCT_ID y su precio/moneda los decide el servidor.']),
    section('HUMAN HANDOFF', [brain.handoffWhen]),
    section('SPECIAL INSTRUCTIONS', [brain.specialInstructions]),
  ].filter(Boolean).join('\n\n');
}

export async function loadExistingGlobalSalesContext(workspaceId: string) {
  const { prisma } = await import('../prisma');
  const profile = await prisma.workspaceProfile.findUnique({
    where: { workspaceId },
    select: { about: true, policies: true, shippingInfo: true, returnsPolicy: true },
  });
  if (!profile) return '';
  return section('EXISTING WORKSPACE CONTEXT', [profile.about, profile.policies, profile.shippingInfo, profile.returnsPolicy]);
}

export async function loadProductSalesLayer(workspaceId: string, productId: string | null) {
  if (!productId) return null;
  const { prisma } = await import('../prisma');
  const product = await prisma.product.findFirst({
    where: { id: productId, workspaceId },
    include: { salesBrain: true, variants: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] } },
  });
  if (!product?.salesBrain || product.salesBrain.workspaceId !== workspaceId) return null;
  return {
    productId: product.id,
    contextId: product.salesBrain.id,
    updatedAt: product.salesBrain.updatedAt,
    content: buildProductSalesContext({ product, brain: product.salesBrain }),
  };
}
