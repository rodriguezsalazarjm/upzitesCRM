import { NextResponse } from 'next/server';
import { StorageNotConfiguredError } from '../../storage';
import { handleStudio } from '../product-studio/http';

/** Errores del Digital Asset Manager → HTTP (mismo contrato que el Studio). */
export async function handleAssets(run: () => Promise<Response>): Promise<Response> {
  return handleStudio(async () => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof StorageNotConfiguredError) {
        // El motivo exacto (variables, bucket) queda en el log del servidor.
        console.error('delivery_storage_not_configured', { reason: error.message });
        return NextResponse.json(
          { code: 'STORAGE_NOT_CONFIGURED', message: 'El almacenamiento de archivos entregables no está configurado. Mientras tanto puedes agregar enlaces.' },
          { status: 503 },
        );
      }
      throw error;
    }
  });
}

/** Content-Disposition con nombre seguro (ASCII + UTF-8 segun RFC 6266/5987). */
export function contentDisposition(kind: 'inline' | 'attachment', fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** Cabeceras para servir un archivo privado desde nuestro origen. */
export function privateFileHeaders(mimeType: string, size: number, disposition: string) {
  return {
    'Content-Type': mimeType,
    'Content-Length': String(size),
    'Content-Disposition': disposition,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; media-src 'self'; sandbox",
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
  };
}

/** Se reproduce dentro del navegador solo audio y video verificados. */
export function playable(mimeType: string | null) {
  return Boolean(mimeType && (mimeType.startsWith('audio/') || mimeType.startsWith('video/')));
}
