import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { studioActor } from '@/lib/commerce/product-studio/http';
import { storeLocalUpload } from '@/lib/commerce/digital-assets/service';
import { handleAssets } from '@/lib/commerce/digital-assets/http';
import { DELIVERABLE_MAX_BYTES } from '@/lib/commerce/digital-assets/rules';

export const dynamic = 'force-dynamic';

/**
 * Destino de subida con el disco local (desarrollo y pruebas). En produccion el
 * archivo va al bucket con una URL firmada y esta ruta responde 403: el
 * servicio solo la acepta con el driver de disco.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const intent = new URL(request.url).searchParams.get('intent') ?? '';
  if (Number(request.headers.get('content-length') ?? 0) > DELIVERABLE_MAX_BYTES) {
    return NextResponse.json({ code: 'INVALID', message: 'El archivo supera 50 MB.', field: 'file' }, { status: 413 });
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  return handleAssets(async () => {
    await storeLocalUpload(studioActor(user), id, intent, bytes);
    return NextResponse.json({ data: { stored: true } });
  });
}
