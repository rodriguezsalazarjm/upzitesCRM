import { archiveTemplate, saveTemplate } from '@/lib/quote-studio/service';
import { jsonBody, studioHandler } from '../../http';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  return studioHandler(async ({ workspaceId }) => saveTemplate(workspaceId, await jsonBody(request), id), { manage: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  return studioHandler(async ({ workspaceId }) => archiveTemplate(workspaceId, id), { manage: true });
}
