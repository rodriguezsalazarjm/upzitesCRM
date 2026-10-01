import { NextResponse } from 'next/server';
import { ProductStatus } from '../../../../../../generated/prisma/client';
import { getCurrentUser, requireCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyProductKey } from '@/lib/commerce/product-link';
import { COVER_MAX_BYTES, coverBelongsTo, readCover, readCoverBytes } from '@/lib/commerce/product-studio/cover';
import { removeStudioCover, uploadStudioCover } from '@/lib/commerce/product-studio/service';
import { handleStudio, studioActor } from '@/lib/commerce/product-studio/http';

export const dynamic = 'force-dynamic';

/**
 * Portada de un producto.
 *  - Comprador: con la firma del enlace de compra y SOLO si el producto esta
 *    publicado.
 *  - Equipo: con sesion en el workspace dueno (borradores incluidos).
 * Se sirve con el tipo verificado al subirla y `nosniff`: nunca como HTML.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = new URL(request.url).searchParams.get('k');
  let product: { id: string; workspaceId: string; metadata: unknown } | null = null;
  let isPublic = false;

  if (key && verifyProductKey(id, key)) {
    product = await prisma.product.findFirst({ where: { id, status: ProductStatus.ACTIVE }, select: { id: true, workspaceId: true, metadata: true } });
    isPublic = true;
  } else {
    const user = await getCurrentUser();
    if (user) product = await prisma.product.findFirst({ where: { id, workspaceId: user.workspace.id }, select: { id: true, workspaceId: true, metadata: true } });
  }

  const cover = product ? readCover(product.metadata) : null;
  if (!product || !cover || !coverBelongsTo(cover, product.workspaceId, product.id)) return new NextResponse(null, { status: 404 });
  const stored = await readCoverBytes(cover).catch(() => null);
  if (!stored) return new NextResponse(null, { status: 404 });

  return new NextResponse(stored.bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': cover.mimeType,
      'Content-Length': String(stored.bytes.byteLength),
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': isPublic ? 'public, max-age=300' : 'private, max-age=300',
    },
  });
}

/** Sube o reemplaza la portada (OWNER/ADMIN). multipart/form-data, campo `file`. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  // Corte temprano por tamano declarado; el limite real se valida con los bytes.
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > COVER_MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ code: 'TOO_LARGE', message: 'La imagen supera 5 MB.', field: 'cover' }, { status: 413 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string') return NextResponse.json({ code: 'INVALID', message: 'Elige una imagen.', field: 'cover' }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  return handleStudio(async () => {
    const cover = await uploadStudioCover(studioActor(user), id, bytes);
    return NextResponse.json({ data: { version: cover.uploadedAt } });
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  return handleStudio(async () => NextResponse.json({ data: await removeStudioCover(studioActor(user), id) }));
}
