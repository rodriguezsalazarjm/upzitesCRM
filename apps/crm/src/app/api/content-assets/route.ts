import { parseBody } from '@/lib/http';
import { finalizeLibraryUpload, finalizeSchema } from '@/lib/social/library-service';
import { libraryHandler } from './http';

export const dynamic = 'force-dynamic';

/** Paso 2 de la subida: confirma el archivo ya subido y crea la pieza. */
export async function POST(request: Request) {
  const parsed = await parseBody(request, finalizeSchema);
  if (!parsed.ok) return parsed.response;
  return libraryHandler((user) => finalizeLibraryUpload(user.workspaceId, user.id, parsed.data), 201);
}
