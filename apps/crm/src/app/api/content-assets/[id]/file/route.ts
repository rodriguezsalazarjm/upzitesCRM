import { NextResponse } from 'next/server';
import { crossTenantPrisma } from '@/lib/prisma';
import { getSessionSecret } from '@/lib/session-token';
import { verifyAssetKey } from '@/lib/social/library';
import { resolveStorage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * Archivo de una pieza de la biblioteca. Lo descarga Instagram (sin sesión),
 * así que se exige la firma de la pieza. Con Supabase redirige a una URL
 * firmada de vida corta (los videos no caben en la respuesta de la función).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!verifyAssetKey(id, new URL(request.url).searchParams.get('k'), getSessionSecret())) return new NextResponse(null, { status: 404 });
  // Cross-tenant a propósito: la firma ya ata la URL a esta pieza.
  const asset = await crossTenantPrisma.contentAsset.findUnique({ where: { id }, select: { storageKey: true, mimeType: true } });
  if (!asset) return new NextResponse(null, { status: 404 });
  const storage = await resolveStorage();
  if (storage.signedDownloadUrl) {
    return NextResponse.redirect(await storage.signedDownloadUrl(asset.storageKey, { expiresInSeconds: 3600 }), 302);
  }
  const stored = await storage.get(asset.storageKey);
  if (!stored) return new NextResponse(null, { status: 404 });
  return new NextResponse(stored.bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': asset.mimeType,
      'Content-Length': String(stored.bytes.byteLength),
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'public, max-age=300',
    },
  });
}
