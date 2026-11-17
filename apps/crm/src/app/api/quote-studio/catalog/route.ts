import { saveCatalogItem } from '@/lib/quote-studio/service';
import { jsonBody, studioHandler } from '../http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return studioHandler(async ({ workspaceId }) => saveCatalogItem(workspaceId, await jsonBody(request)), { manage: true, status: 201 });
}
