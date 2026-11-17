import { archiveCatalogItem, saveCatalogItem } from '@/lib/quote-studio/service';
import { jsonBody, studioHandler } from '../../http';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  return studioHandler(async ({ workspaceId }) => saveCatalogItem(workspaceId, await jsonBody(request), id), { manage: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  return studioHandler(async ({ workspaceId }) => archiveCatalogItem(workspaceId, id), { manage: true });
}
