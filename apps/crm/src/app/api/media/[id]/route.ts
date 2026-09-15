import { NextResponse } from 'next/server';
import { MediaAssetStatus } from '../../../../../generated/prisma/client';
import { getCurrentUser } from '@/lib/auth';
import { dispositionFor, safeFileName } from '@/lib/media/policy';
import { prisma } from '@/lib/prisma';
import { resolveStorage } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Entrega un archivo recibido por WhatsApp.
 *
 * Es la unica puerta: el archivo vive en un bucket privado y el navegador
 * nunca ve ni el token de Meta ni una URL del proveedor. Cada peticion vuelve a
 * comprobar sesion y workspace, porque un identificador adivinado no puede
 * valer como autorizacion.
 */

/** Cabecera con el nombre del archivo, legible y a prueba de nombres hostiles. */
function contentDisposition(disposition: string, fileName: string) {
  // El nombre lo escribio quien envio el archivo. La version ASCII evita romper
  // la cabecera; `filename*` conserva tildes y ñ para quien pueda leerlas.
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ message: 'Sesion requerida.' }, { status: 401 });
  }

  const { id } = await params;

  const asset = await prisma.mediaAsset.findFirst({
    // El workspace va en el `where`, no en una comprobacion posterior: asi un
    // id de otro cliente no existe en vez de existir y estar prohibido.
    where: { id, workspaceId: user.workspace.id },
    select: {
      status: true,
      mimeType: true,
      fileName: true,
      sizeBytes: true,
      storageKey: true,
      contentConfirmed: true,
    },
  });

  if (!asset) {
    return NextResponse.json({ message: 'Archivo no encontrado.' }, { status: 404 });
  }

  if (asset.status !== MediaAssetStatus.STORED || !asset.storageKey) {
    // El estado se cuenta con palabras porque el operador lo va a leer: no es
    // lo mismo "todavia se esta descargando" que "ya no existe".
    return NextResponse.json(
      { message: 'El archivo no esta disponible.', status: asset.status },
      { status: 409 },
    );
  }

  let stored;
  try {
    stored = await (await resolveStorage()).get(asset.storageKey);
  } catch {
    return NextResponse.json(
      { message: 'No se pudo leer el archivo del almacenamiento.' },
      { status: 502 },
    );
  }

  if (!stored) {
    return NextResponse.json({ message: 'Archivo no encontrado.' }, { status: 404 });
  }

  const mimeType = asset.mimeType ?? 'application/octet-stream';
  const fileName = safeFileName(asset.fileName, mimeType);
  const disposition = dispositionFor(mimeType, asset.contentConfirmed);

  return new Response(stored.bytes as unknown as BodyInit, {
    headers: {
      // El tipo es el que se verifico contra los bytes al guardar, no el que
      // declaro el remitente ni el que devuelve el almacenamiento.
      'Content-Type': mimeType,
      'Content-Length': String(stored.bytes.byteLength),
      'Content-Disposition': contentDisposition(disposition, fileName),
      // Sin esto el navegador puede decidir por su cuenta que un archivo es
      // HTML y ejecutarlo en nuestro origen.
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox; base-uri 'none'; form-action 'none'",
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Referrer-Policy': 'no-referrer',
      // Privado y corto: es contenido de un cliente, no un recurso estatico.
      'Cache-Control': 'private, max-age=300, must-revalidate',
    },
  });
}
