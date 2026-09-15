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
 * Borra los archivos que quedaron sin dueno.
 *
 * Pasa cuando se borra un contacto: caen en cascada sus conversaciones y
 * mensajes, y la fila del archivo queda con `messageId` nulo. Sin esto el
 * objeto seguiria en el bucket para siempre, sin nada que lo apuntara: el
 * contacto pidio que se borraran sus datos y su foto seguiria ahi.
 */
export async function purgeOrphanMedia() {
  const orphans = await prisma.mediaAsset.findMany({
    where: {
      messageId: null,
      status: MediaAssetStatus.STORED,
      storageKey: { not: null },
    },
    select: { id: true, storageKey: true },
    take: BATCH,
  });

  if (orphans.length === 0) return { purged: 0, failed: 0 };

  let storage;
  try {
    storage = await resolveStorage();
  } catch {
    return { purged: 0, failed: orphans.length };
  }

  let purged = 0;
  let failed = 0;

  for (const asset of orphans) {
    try {
      await storage.remove(asset.storageKey as string);
      // La fila se borra entera: ya no describe nada que exista, y conservarla
      // solo dejaria el rastro de un archivo de alguien que pidio irse.
      await prisma.mediaAsset.delete({ where: { id: asset.id } });
      purged += 1;
    } catch {
      failed += 1;
    }
  }

  return { purged, failed };
}

/**
 * Borra ya los archivos de un contacto que se esta eliminando.
 *
 * `purgeOrphanMedia` los alcanzaria igual en la siguiente pasada de
 * mantenimiento, pero "manana" no es una respuesta aceptable cuando alguien
 * pidio que borraran sus datos. Esto lo hace en el momento; la pasada diaria
 * queda como red por si el almacenamiento no responde justo ahora.
 */
export async function purgeMediaForContact(workspaceId: string, contactId: string) {
  const assets = await prisma.mediaAsset.findMany({
    where: {
      workspaceId,
      storageKey: { not: null },
      conversation: { contactId },
    },
    select: { id: true, storageKey: true },
  });

  if (assets.length === 0) return { purged: 0, failed: 0 };

  let storage;
  try {
    storage = await resolveStorage();
  } catch {
    return { purged: 0, failed: assets.length };
  }

  let purged = 0;
  let failed = 0;

  for (const asset of assets) {
    try {
      await storage.remove(asset.storageKey as string);
      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          status: MediaAssetStatus.PURGED,
          storageKey: null,
          purgedAt: new Date(),
          error: 'Borrado junto con el contacto.',
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
