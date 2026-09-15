import { createHash } from 'node:crypto';
import { MediaAssetStatus } from '../../../generated/prisma/client';
import { prisma } from '../prisma';
import {
  MAX_BYTES_BY_KIND,
  extensionFor,
  isMediaKind,
  retentionDays,
  safeFileName,
  verifyContent,
  type MediaKind,
} from '../media/policy';
import { StorageNotConfiguredError, resolveStorage } from '../storage';
import { resolveToken } from './client';
import { assertMetaMediaUrl } from './media-url';
import { whatsappGraphVersion } from './meta';

/**
 * Descarga de medios de WhatsApp.
 *
 * Meta no entrega el archivo en el webhook: entrega un identificador que hay
 * que resolver y descargar desde el servidor, con el token del canal y dentro
 * de una ventana corta. Dos consecuencias de diseno salen de ahi:
 *
 * 1. El navegador nunca participa. Ni el token ni una URL de Meta llegan al
 *    cliente; el archivo se guarda en almacenamiento propio y se sirve por una
 *    ruta nuestra que vuelve a comprobar sesion y workspace.
 * 2. La descarga es un trabajo de la cola, no parte del webhook. El webhook
 *    debe responder 200 rapido, y un archivo de 16 MB no cabe en esa promesa.
 */

type MediaSource = {
  url: string;
  mimeType: string | null;
  sha256: string | null;
  fileSize: number | null;
};

class MediaError extends Error {
  constructor(
    message: string,
    readonly status: MediaAssetStatus,
  ) {
    super(message);
    this.name = 'MediaError';
  }
}

/** Paso 1: el identificador se cambia por una URL temporal y sus metadatos. */
async function resolveMediaSource(mediaId: string, token: string): Promise<MediaSource> {
  const url = `https://graph.facebook.com/${whatsappGraphVersion()}/${encodeURIComponent(mediaId)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch {
    throw new MediaError('No se pudo contactar a WhatsApp.', MediaAssetStatus.FAILED);
  }

  if (response.status === 404 || response.status === 410) {
    throw new MediaError(
      'WhatsApp ya no conserva este archivo. Los medios caducan en el proveedor.',
      MediaAssetStatus.EXPIRED,
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new MediaError(
      'Las credenciales de WhatsApp no permiten descargar este archivo.',
      MediaAssetStatus.FAILED,
    );
  }

  if (!response.ok) {
    throw new MediaError(
      `WhatsApp rechazo la consulta del archivo (HTTP ${response.status}).`,
      MediaAssetStatus.FAILED,
    );
  }

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const href = typeof body.url === 'string' ? body.url : null;
  if (!href) {
    throw new MediaError('WhatsApp no devolvio una direccion de descarga.', MediaAssetStatus.FAILED);
  }

  const size = Number(body.file_size);

  return {
    url: href,
    mimeType: typeof body.mime_type === 'string' ? body.mime_type : null,
    sha256: typeof body.sha256 === 'string' ? body.sha256 : null,
    fileSize: Number.isFinite(size) ? size : null,
  };
}

/**
 * Paso 2: la descarga.
 *
 * Los redirecciones se siguen a mano para poder validar cada salto: seguirlas
 * de forma automatica significaria mandar el token de WhatsApp a donde diga la
 * cabecera `Location`.
 */
async function downloadBytes(source: string, token: string, maxBytes: number) {
  let current = assertMetaMediaUrl(source);

  for (let hop = 0; hop < 4; hop += 1) {
    let response: Response;
    try {
      response = await fetch(current, {
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'manual',
        cache: 'no-store',
      });
    } catch {
      throw new MediaError('No se pudo descargar el archivo.', MediaAssetStatus.FAILED);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new MediaError('La descarga redirigio a ninguna parte.', MediaAssetStatus.FAILED);
      }
      current = assertMetaMediaUrl(new URL(location, current).toString());
      continue;
    }

    if (response.status === 404 || response.status === 410) {
      throw new MediaError('WhatsApp ya no conserva este archivo.', MediaAssetStatus.EXPIRED);
    }

    if (!response.ok || !response.body) {
      throw new MediaError(
        `La descarga fallo (HTTP ${response.status}).`,
        MediaAssetStatus.FAILED,
      );
    }

    // El tamano declarado se comprueba antes de leer, y el real mientras se lee:
    // una cabecera puede mentir, los bytes no.
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw new MediaError('El archivo supera el tamano admitido.', MediaAssetStatus.REJECTED);
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new MediaError('El archivo supera el tamano admitido.', MediaAssetStatus.REJECTED);
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return { bytes, contentType: response.headers.get('content-type') };
  }

  throw new MediaError('La descarga dio demasiadas vueltas.', MediaAssetStatus.FAILED);
}

/** Cuantos intentos antes de dejar de insistir con un archivo. */
const MAX_ATTEMPTS = 5;

export type DownloadOutcome = {
  status: MediaAssetStatus;
  assetId: string;
  skipped?: boolean;
  error?: string;
};

/**
 * Trabajo de la cola: descarga y guarda un archivo recibido.
 *
 * Idempotente por reserva de fila: solo avanza quien consigue mover el estado a
 * `DOWNLOADING`. Un reintento sobre un archivo ya guardado no vuelve a pedirlo.
 */
export async function downloadWhatsAppMedia(mediaAssetId: string): Promise<DownloadOutcome> {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id: mediaAssetId },
    select: {
      id: true,
      workspaceId: true,
      externalMediaId: true,
      kind: true,
      status: true,
      attempts: true,
      declaredMime: true,
      fileName: true,
      conversation: {
        select: {
          workspaceId: true,
          channel: {
            select: {
              workspaceId: true,
              phoneNumberId: true,
              accessTokenEncrypted: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!asset) return { status: MediaAssetStatus.FAILED, assetId: mediaAssetId, skipped: true };
  if (!isMediaKind(asset.kind)) {
    return { status: asset.status, assetId: asset.id, skipped: true };
  }

  // Solo se reintenta lo que sigue pendiente. `BLOCKED` entra porque su causa
  // es externa: cuando el propietario configura el almacenamiento, el mismo
  // archivo se reencola sin que nadie lo toque a mano.
  const claimable: MediaAssetStatus[] = [
    MediaAssetStatus.PENDING,
    MediaAssetStatus.FAILED,
    MediaAssetStatus.BLOCKED,
  ];
  if (!claimable.includes(asset.status)) {
    return { status: asset.status, assetId: asset.id, skipped: true };
  }

  const claimed = await prisma.mediaAsset.updateMany({
    where: { id: asset.id, status: asset.status },
    data: { status: MediaAssetStatus.DOWNLOADING, attempts: { increment: 1 } },
  });
  if (claimed.count === 0) {
    return { status: asset.status, assetId: asset.id, skipped: true };
  }

  const attempts = asset.attempts + 1;

  const fail = async (status: MediaAssetStatus, message: string) => {
    await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { status, error: message },
    });
    return { status, assetId: asset.id, error: message };
  };

  const channel = asset.conversation?.channel;
  if (!channel || channel.workspaceId !== asset.workspaceId) {
    // Un archivo cuyo canal no pertenece al mismo workspace no se descarga: no
    // hay credencial legitima con la que pedirlo.
    return fail(MediaAssetStatus.REJECTED, 'El archivo no pertenece a este canal.');
  }

  const token = resolveToken(channel);
  if (!token) {
    return fail(MediaAssetStatus.BLOCKED, 'Falta el token de acceso del canal de WhatsApp.');
  }

  const kind = asset.kind as MediaKind;

  try {
    const source = await resolveMediaSource(asset.externalMediaId, token);
    const maxBytes = MAX_BYTES_BY_KIND[kind];

    if (source.fileSize !== null && source.fileSize > maxBytes) {
      return fail(MediaAssetStatus.REJECTED, 'El archivo supera el tamano admitido.');
    }

    const declared = source.mimeType ?? asset.declaredMime;
    const downloaded = await downloadBytes(source.url, token, maxBytes);

    const verdict = verifyContent(kind, declared, downloaded.bytes);
    if (!verdict.ok) return fail(MediaAssetStatus.REJECTED, verdict.reason);

    const sha256 = createHash('sha256').update(downloaded.bytes).digest('base64');
    // Meta publica el hash del archivo. Si no coincide, algo se altero entre su
    // almacenamiento y el nuestro, y no es este el lugar para suponer cual.
    if (source.sha256 && source.sha256 !== sha256) {
      return fail(MediaAssetStatus.REJECTED, 'El archivo no coincide con su huella declarada.');
    }

    const storage = await resolveStorage();
    const now = new Date();
    const key = [
      'workspaces',
      asset.workspaceId,
      'whatsapp',
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      `${asset.id}.${extensionFor(verdict.mimeType)}`,
    ].join('/');

    await storage.put(key, downloaded.bytes, verdict.mimeType);

    const expiresAt = new Date(now.getTime() + retentionDays() * 24 * 60 * 60 * 1000);

    await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        status: MediaAssetStatus.STORED,
        mimeType: verdict.mimeType,
        declaredMime: declared ?? null,
        fileName: safeFileName(asset.fileName, verdict.mimeType),
        sizeBytes: downloaded.bytes.byteLength,
        sha256,
        storageDriver: storage.name,
        storageKey: key,
        downloadedAt: now,
        expiresAt,
        error: null,
        // Un archivo confirmado por firma puede mostrarse dentro de la pagina;
        // uno sin firma reconocida se descarga. Se anota al guardarlo para que
        // servirlo no dependa de volver a mirar los bytes.
        contentConfirmed: verdict.confirmed,
      },
    });

    return { status: MediaAssetStatus.STORED, assetId: asset.id };
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      return fail(MediaAssetStatus.BLOCKED, error.message);
    }

    const status = error instanceof MediaError ? error.status : MediaAssetStatus.FAILED;
    const message = error instanceof Error ? error.message : 'Error desconocido al descargar.';

    // Los estados terminales no se reintentan aunque queden intentos.
    if (status !== MediaAssetStatus.FAILED) return fail(status, message);

    if (attempts >= MAX_ATTEMPTS) {
      return fail(MediaAssetStatus.FAILED, `${message} Se agotaron los reintentos.`);
    }

    await fail(MediaAssetStatus.FAILED, message);
    // Se propaga para que la cola aplique su espera entre reintentos.
    throw error;
  }
}
