import { parseBody } from '@/lib/http';
import { assetMetaSchema, deleteLibraryAsset, updateLibraryAsset } from '@/lib/social/library-service';
import { libraryHandler } from '../http';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseBody(request, assetMetaSchema);
  if (!parsed.ok) return parsed.response;
  return libraryHandler((user) => updateLibraryAsset(user.workspaceId, id, parsed.data));
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return libraryHandler((user) => deleteLibraryAsset(user.workspaceId, id));
}
