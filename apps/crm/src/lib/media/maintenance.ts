import { JobType, MediaAssetStatus } from '../../../generated/prisma/client';
import { enqueue } from '../jobs/queue';
import { prisma } from '../prisma';
import { resolveStorage, storageStatus } from '../storage';

/**
 * Mantenimiento de los archivos recibidos.
 *
 * Dos tareas que nadie va a recordar hacer a mano: borrar lo que cumplio su
 * plazo y reintentar lo que quedo detenido por una causa externa.
 */

/** Cuantos se procesan por ejecucion: el mantenimiento no debe monopolizar la cola. */
const BATCH = 200;

/**
 * Borra los archivos vencidos.
 *
 * La fila no se borra: queda como `PURGED`, sin clave de almacenamiento. Asi la
 * conversacion sigue contando que ahi hubo un archivo y por que ya no esta, en
 * lugar de mostrar un hueco.
 */
export async function purgeExpiredMedia(now = new Date()) {
  const expired = await prisma.mediaAsset.findMany({
    where: {
      status: MediaAssetStatus.STORED,
      expiresAt: { not: null, lte: now },
      storageKey: { not: null },
    },
    select: { id: true, storageKey: true },
    take: BATCH,
  });

  if (expired.length === 0) return { purged: 0, failed: 0 };

  let purged = 0;
  let failed = 0;

  // Si el almacenamiento no responde, no se marca nada como borrado: decir que
  // un dato se elimino cuando sigue ahi es la peor forma de equivocarse.
  let storage;
  try {
    storage = await resolveStorage();
  } catch {
    return { purged: 0, failed: expired.length };
  }

  for (const asset of expired) {
    try {
      await storage.remove(asset.storageKey as string);
      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          status: MediaAssetStatus.PURGED,
          storageKey: null,
          purgedAt: new Date(),
          error: 'Borrado por politica de retencion.',
        },
      });
      purged += 1;
    } catch {
      failed += 1;
    }
  }

  return { purged, failed };
}

/**
 * Reencola lo que quedo detenido por falta de configuracion.
 *
 * Un archivo en `BLOCKED` no fallo: nunca se intento, porque no habia donde
 * guardarlo. Cuando el propietario configura el almacenamiento, esto lo
 * recupera solo. La clave por dia evita que un bloqueo permanente genere una
 * avalancha de trabajos identicos.
 */
export async function requeueBlockedMedia(now = new Date()) {
  if (!storageStatus().configured) return { requeued: 0, skipped: true };

  const blocked = await prisma.mediaAsset.findMany({
    where: { status: MediaAssetStatus.BLOCKED },
    select: { id: true, workspaceId: true },
    take: BATCH,
  });

  const day = now.toISOString().slice(0, 10);

  for (const asset of blocked) {
    await enqueue({
      type: JobType.DOWNLOAD_WHATSAPP_MEDIA,
      payload: { mediaAssetId: asset.id },
      workspaceId: asset.workspaceId,
      dedupeKey: `media-retry:${asset.id}:${day}`,
      priority: 60,
    });
  }

  return { requeued: blocked.length, skipped: false };
}
