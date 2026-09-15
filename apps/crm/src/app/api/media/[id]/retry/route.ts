import { NextResponse } from 'next/server';
import { JobType, MediaAssetStatus } from '../../../../../../generated/prisma/client';
import { getCurrentUser } from '@/lib/auth';
import { enqueue } from '@/lib/jobs/queue';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

/**
 * Reintenta la descarga de un archivo que no llego.
 *
 * Existe porque los motivos de fallo mas probables son externos y temporales
 * —almacenamiento sin configurar, un corte de red hacia Meta— y esperar al
 * mantenimiento diario para reintentar seria innecesariamente lento cuando el
 * operador ya ve el problema resuelto.
 *
 * Lo que caduco o se rechazo por politica no se reintenta: insistir no cambia
 * el resultado y solo gastaria la cola.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ message: 'Sesion requerida.' }, { status: 401 });

  const { id } = await params;

  const asset = await prisma.mediaAsset.findFirst({
    where: { id, workspaceId: user.workspace.id },
    select: { id: true, status: true },
  });

  if (!asset) return NextResponse.json({ message: 'Archivo no encontrado.' }, { status: 404 });

  const retryable: MediaAssetStatus[] = [
    MediaAssetStatus.FAILED,
    MediaAssetStatus.BLOCKED,
    MediaAssetStatus.PENDING,
  ];

  if (!retryable.includes(asset.status)) {
    return NextResponse.json(
      { message: 'Este archivo no se puede reintentar.', status: asset.status },
      { status: 409 },
    );
  }

  // La clave por minuto deja reintentar de verdad sin permitir que un clic
  // repetido llene la cola de trabajos identicos.
  const minute = new Date().toISOString().slice(0, 16);

  await enqueue({
    type: JobType.DOWNLOAD_WHATSAPP_MEDIA,
    payload: { mediaAssetId: asset.id },
    workspaceId: user.workspace.id,
    dedupeKey: `media-retry:${asset.id}:${minute}`,
    priority: 30,
  });

  return NextResponse.json({ data: { queued: true } });
}
