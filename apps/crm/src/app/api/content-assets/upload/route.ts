import { parseBody } from '@/lib/http';
import { createLibraryUpload, uploadIntentSchema } from '@/lib/social/library-service';
import { libraryHandler } from '../http';

export const dynamic = 'force-dynamic';

/** Paso 1 de la subida: valida tipo y tamaño declarados y devuelve a dónde subir. */
export async function POST(request: Request) {
  const parsed = await parseBody(request, uploadIntentSchema);
  if (!parsed.ok) return parsed.response;
  return libraryHandler((user) => createLibraryUpload(user.workspaceId, parsed.data));
}
