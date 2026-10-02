import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { readJson, studioActor } from '@/lib/commerce/product-studio/http';
import { createUploadIntent } from '@/lib/commerce/digital-assets/service';
import { handleAssets } from '@/lib/commerce/digital-assets/http';

export const dynamic = 'force-dynamic';

/**
 * Prepara la subida de un archivo entregable (OWNER/ADMIN): devuelve a donde
 * subirlo y una intencion firmada. El archivo va directo al bucket privado; la
 * clave la elige el servidor.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  const { id } = await params;
  const body = await readJson(request);
  return handleAssets(async () => NextResponse.json({ data: await createUploadIntent(studioActor(user), id, body) }));
}
