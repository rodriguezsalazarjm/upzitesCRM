import { WorkspaceRole } from '../../../generated/prisma/client';
import { recordAudit } from '../domain/audit';
import { prisma } from '../prisma';
import { canManageWorkspaceSettings } from '../workspace-roles';
import { parseBrainLists, productSalesBrainInputSchema, trainingStatus, type ProductSalesBrainDraft } from './rules';

export class ProductSalesBrainError extends Error {
  constructor(message: string, readonly code: 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID', readonly field?: string) { super(message); }
}

export type ProductSalesBrainActor = { userId: string; workspaceId: string; role: WorkspaceRole };

async function ownedProduct(workspaceId: string, productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, workspaceId }, select: { id: true, name: true } });
  if (!product) throw new ProductSalesBrainError('Producto no encontrado.', 'NOT_FOUND');
  return product;
}

function view(brain: NonNullable<Awaited<ReturnType<typeof prisma.productSalesBrain.findFirst>>>) {
  const lists = parseBrainLists(brain);
  const data = { ...brain, ...lists };
  return { ...data, status: trainingStatus(data) };
}

export async function getProductSalesBrain(workspaceId: string, productId: string) {
  await ownedProduct(workspaceId, productId);
  const brain = await prisma.productSalesBrain.findFirst({ where: { productId, workspaceId } });
  return brain ? view(brain) : null;
}

export async function saveProductSalesBrain(actor: ProductSalesBrainActor, productId: string, raw: unknown) {
  if (!canManageWorkspaceSettings(actor.role)) throw new ProductSalesBrainError('Solo el owner o un admin puede editar el entrenamiento.', 'FORBIDDEN');
  await ownedProduct(actor.workspaceId, productId);
  const parsed = productSalesBrainInputSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ProductSalesBrainError(issue?.message ?? 'Entrenamiento inválido.', 'INVALID', issue?.path.join('.'));
  }
  const existing = await prisma.productSalesBrain.findFirst({ where: { productId, workspaceId: actor.workspaceId }, select: { id: true } });
  const data = { ...parsed.data, faqs: parsed.data.faqs as never, objections: parsed.data.objections as never };
  const brain = await prisma.productSalesBrain.upsert({
    where: { productId },
    create: { ...data, workspaceId: actor.workspaceId, productId },
    update: data,
  });
  await recordAudit({
    workspaceId: actor.workspaceId,
    actorId: actor.userId,
    action: existing ? 'product.sales_brain.updated' : 'product.sales_brain.created',
    entity: 'ProductSalesBrain', entityId: brain.id,
    metadata: { productId, status: trainingStatus(parsed.data), faqCount: parsed.data.faqs.length, objectionCount: parsed.data.objections.length },
  });
  return view(brain);
}

export const EMPTY_PRODUCT_SALES_BRAIN: ProductSalesBrainDraft = {
  productWhat: '', idealFor: '', problems: '', benefits: '', differentiators: '', targetAudience: '', buyerPersona: '',
  faqs: [], objections: [], socialProof: '', guarantee: '', policies: '', salesTone: '', prohibitedClaims: '', askWhen: '',
  offerWhen: '', checkoutWhen: '', insistWhen: '', stopWhen: '', handoffWhen: '', specialInstructions: '',
};
