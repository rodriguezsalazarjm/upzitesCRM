import { z } from 'zod';
import { ContactStatus, ProductStatus, type Prisma } from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import { splitName } from '../capture';
import { noteInboundContact } from '../entitlements/inbound';
import { isEntitlementError } from '../entitlements';
import { createOrder, OrderError } from './orders';
import { publicCheckoutUrl } from './public-checkout-link';
import { publicCoverUrl, verifyProductKey } from './product-link';
import { readCover } from './product-studio/cover';
import { chooseVariant, offerLabel, sellableVariants, type StudioProductType } from './product-studio/rules';

/**
 * Compra publica de un producto (`/comprar/[id]?k=...`).
 *
 * El comprador solo expresa DECISIONES: que variante, su nombre y su email.
 * Producto, precio, moneda y total los resuelve el servidor desde el catalogo
 * del workspace dueno (createOrder). Despues todo sigue en el checkout
 * canonico del Punto 1 (`/checkout/[orderId]?t=...`): producto adicional,
 * cobro, webhook y entrega. Aqui no se cobra.
 *
 * Solo un producto ACTIVE (publicado) es comprable. Borrador y archivado
 * responden "no disponible" sin revelar nombre ni precio.
 */

export type PublicOption = { id: string; label: string; price: number };

export type PublicProductView =
  | { ok: false; reason: 'NOT_FOUND' | 'UNAVAILABLE' }
  | {
      ok: true;
      productId: string;
      workspaceName: string;
      name: string;
      description: string;
      type: StudioProductType;
      currency: string;
      coverUrl: string | null;
      needsChoice: boolean;
      options: PublicOption[];
    };

async function loadProduct(productId: string) {
  return prisma.product.findFirst({
    where: { id: productId },
    include: {
      workspace: { select: { name: true } },
      variants: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }] },
    },
  });
}

type LoadedProduct = NonNullable<Awaited<ReturnType<typeof loadProduct>>>;

function variantsOf(product: LoadedProduct) {
  return product.variants.map((variant) => ({ ...variant, price: variant.priceMinor }));
}

/** Vista del producto tal como la ve el comprador (tambien la usa la vista previa). */
export function presentProduct(product: LoadedProduct, coverUrl: string | null): Extract<PublicProductView, { ok: true }> {
  const sellable = sellableVariants(variantsOf(product));
  return {
    ok: true,
    productId: product.id,
    workspaceName: product.workspace.name,
    name: product.name,
    description: product.description ?? '',
    type: product.type,
    currency: product.currency,
    coverUrl,
    needsChoice: sellable.needsChoice,
    options: sellable.variants.map((variant) => ({ id: variant.id, label: sellable.needsChoice ? variant.name : offerLabel(product.name, variant), price: variant.priceMinor })),
  };
}

export async function loadPublicProduct(productId: string, key: string | null | undefined): Promise<PublicProductView> {
  if (!verifyProductKey(productId, key)) return { ok: false, reason: 'NOT_FOUND' };
  const product = await loadProduct(productId);
  if (!product) return { ok: false, reason: 'NOT_FOUND' };
  if (product.status !== ProductStatus.ACTIVE) return { ok: false, reason: 'UNAVAILABLE' };
  const view = presentProduct(product, null);
  if (view.options.length === 0) return { ok: false, reason: 'UNAVAILABLE' };
  const cover = readCover(product.metadata);
  return { ...view, coverUrl: cover ? publicCoverUrl(product.id, cover.uploadedAt || cover.key) : null };
}

/** Producto para la vista previa administrativa: mismo dibujo, cualquier estado. */
export async function loadProductForPreview(workspaceId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, workspaceId },
    include: { workspace: { select: { name: true } }, variants: { orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }] } },
  });
  if (!product) return null;
  const cover = readCover(product.metadata);
  const coverUrl = cover ? `/api/products/${encodeURIComponent(product.id)}/cover?v=${encodeURIComponent(cover.uploadedAt || cover.key)}` : null;
  return { product, view: presentProduct(product, coverUrl) };
}

export const buyerSchema = z.object({
  name: z.string().trim().min(1, 'Escribe tu nombre.').max(120),
  email: z.string().trim().toLowerCase().max(254).email('Escribe un email válido.'),
});

export type StartProductCheckoutResult =
  | { ok: true; checkoutPath: string; orderId: string }
  | { ok: false; reason: 'NOT_FOUND' | 'UNAVAILABLE' | 'CHOOSE_VARIANT' | 'INVALID_VARIANT' | 'INVALID_BUYER' };

/** Contacto del comprador: se reutiliza el del email, sin sobrescribir sus datos. */
async function buyerContact(workspaceId: string, buyer: { name: string; email: string }) {
  const existing = await prisma.contact.findUnique({ where: { workspaceId_email: { workspaceId, email: buyer.email } }, select: { id: true } });
  if (existing) return existing.id;
  const { firstName, lastName } = splitName(buyer.name);
  try {
    const contact = await prisma.contact.create({
      data: { workspaceId, firstName, lastName, email: buyer.email, status: ContactStatus.LEAD, source: 'checkout', tags: ['checkout'], lastActivityAt: new Date() },
      select: { id: true },
    });
    // Un comprador nunca se pierde por el limite de contactos (P0-C): se audita.
    await noteInboundContact({ workspaceId, contactId: contact.id, source: 'CHECKOUT' });
    return contact.id;
  } catch (error) {
    // Dos envios simultaneos con el mismo email: gana uno, el otro lo lee.
    if ((error as { code?: unknown })?.code !== 'P2002') throw error;
    const again = await prisma.contact.findUnique({ where: { workspaceId_email: { workspaceId, email: buyer.email } }, select: { id: true } });
    if (!again) throw error;
    return again.id;
  }
}

export async function startProductCheckout(
  productId: string,
  key: string | null | undefined,
  input: { variantId?: string | null; name?: unknown; email?: unknown },
): Promise<StartProductCheckoutResult> {
  if (!verifyProductKey(productId, key)) return { ok: false, reason: 'NOT_FOUND' };
  const product = await loadProduct(productId);
  if (!product) return { ok: false, reason: 'NOT_FOUND' };
  if (product.status !== ProductStatus.ACTIVE) return { ok: false, reason: 'UNAVAILABLE' };

  const choice = chooseVariant(variantsOf(product), typeof input.variantId === 'string' && input.variantId ? input.variantId : null);
  if (!choice.ok) return { ok: false, reason: choice.reason };

  const buyer = buyerSchema.safeParse({ name: input.name, email: input.email });
  if (!buyer.success) return { ok: false, reason: 'INVALID_BUYER' };

  try {
    const contactId = await buyerContact(product.workspaceId, buyer.data);
    // createOrder vuelve a validar variante, workspace, estado y precio.
    const order = await createOrder({
      workspaceId: product.workspaceId,
      contactId,
      customerEmail: buyer.data.email,
      customerName: buyer.data.name,
      items: [{ variantId: choice.variant.id, quantity: 1 }],
    });
    await prisma.customerOrder.update({
      where: { id: order.id },
      data: { metadata: { source: 'product_link', productId: product.id, mainVariantId: choice.variant.id } as Prisma.InputJsonValue },
    });
    return { ok: true, orderId: order.id, checkoutPath: publicCheckoutUrl(order.id, { absolute: false }) };
  } catch (error) {
    // Plan sin comercio, producto que dejo de estar disponible entre la vista
    // y el envio: al comprador solo se le dice que no esta disponible.
    if (isEntitlementError(error) || error instanceof OrderError) {
      console.error('product_checkout_unavailable', { productId, error: error.message });
      return { ok: false, reason: 'UNAVAILABLE' };
    }
    throw error;
  }
}
