import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { studioActor } from '@/lib/commerce/product-studio/http';
import { previewAsset } from '@/lib/commerce/digital-assets/service';
import { contentDisposition, playable, privateFileHeaders } from '@/lib/commerce/digital-assets/http';
import { handleAssets } from '@/lib/commerce/digital-assets/http';

export const dynamic = 'force-dynamic';

/**
 * Vista previa para el equipo (OWNER/ADMIN): no usa el token del comprador, no
 * crea ventas ni toca entregas. Un archivo privado se abre por una URL firmada
 * de un minuto (o servido aqui con el disco local de desarrollo).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  const user = await requireCurrentUser();
  const { id, assetId } = await params;
  return handleAssets(async () => {
    const preview = await previewAsset(studioActor(user), id, assetId);
    if (preview.type === 'redirect') {
      return NextResponse.redirect(preview.url, { status: 302, headers: { 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' } });
    }
    // Audio y video se reproducen; PDF y ZIP se descargan (un documento abierto
    // en nuestro origen es superficie de ataque).
    const kind = playable(preview.mimeType) ? 'inline' : 'attachment';
    return new NextResponse(preview.bytes as unknown as BodyInit, {
      headers: privateFileHeaders(preview.mimeType, preview.bytes.byteLength, contentDisposition(kind, preview.fileName)),
    });
  });
}
