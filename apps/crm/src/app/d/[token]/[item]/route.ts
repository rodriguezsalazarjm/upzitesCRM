import { NextResponse } from 'next/server';
import { DigitalAssetKind } from '../../../../../generated/prisma/client';
import { resolveDeliveryItem } from '@/lib/commerce/delivery';
import { externalUrlProblem } from '@/lib/commerce/digital-assets/rules';
import { contentDisposition, playable, privateFileHeaders } from '@/lib/commerce/digital-assets/http';
import { SIGNED_URL_TTL_SECONDS } from '@/lib/commerce/digital-assets/service';
import { resolveDeliveryStorage } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * Acceso del comprador a UN contenido de su entrega: `/d/<token>/<item>`.
 *
 * El token se valida en el servidor en cada pedido (revocacion, vencimiento,
 * tope de descargas) y el item tiene que pertenecer a ESA entrega. Un archivo
 * privado nunca tiene URL publica: se firma una URL de un minuto en el bucket
 * (o, con el disco local de desarrollo, se sirve desde aqui). `?ver=1` pide
 * reproducir audio/video en vez de descargar.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string; item: string }> }) {
  const { token, item: itemId } = await params;
  const back = new URL(`/d/${encodeURIComponent(token)}`, request.url);
  const result = await resolveDeliveryItem(token, itemId);

  if (!result.ok) {
    if (result.reason === 'NOT_FOUND') return new NextResponse('No encontrado', { status: 404, headers: { 'Cache-Control': 'no-store' } });
    // Revocada, vencida o sin descargas: la pagina de la entrega explica el motivo.
    return NextResponse.redirect(back, { status: 303, headers: { 'Referrer-Policy': 'no-referrer' } });
  }

  const { item } = result;
  if (item.kind === DigitalAssetKind.LINK) {
    // Se vuelve a validar al servir: un enlace heredado o manipulado en la base
    // nunca redirige a javascript:, data: ni a otro esquema.
    if (externalUrlProblem(item.target)) return new NextResponse('No encontrado', { status: 404 });
    return NextResponse.redirect(item.target, { status: 302, headers: { 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' } });
  }

  if (!item.mimeType) return new NextResponse('No encontrado', { status: 404 });
  const inline = new URL(request.url).searchParams.get('ver') === '1' && playable(item.mimeType);
  const fileName = item.fileName ?? item.name;

  try {
    const storage = await resolveDeliveryStorage();
    if (storage.signedDownloadUrl) {
      const signed = await storage.signedDownloadUrl(item.target, {
        expiresInSeconds: SIGNED_URL_TTL_SECONDS,
        downloadName: inline ? undefined : fileName,
      });
      return NextResponse.redirect(signed, { status: 302, headers: { 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' } });
    }
    const stored = await storage.get(item.target);
    if (!stored) return new NextResponse('El archivo no está disponible. Escríbele al vendedor.', { status: 404 });
    return new NextResponse(stored.bytes as unknown as BodyInit, {
      headers: privateFileHeaders(item.mimeType, stored.bytes.byteLength, contentDisposition(inline ? 'inline' : 'attachment', fileName)),
    });
  } catch (error) {
    console.error('delivery_item_serve_failed', { error: error instanceof Error ? error.message : String(error) });
    return new NextResponse('No pudimos entregar el archivo en este momento. Intenta de nuevo en unos minutos.', { status: 503 });
  }
}
