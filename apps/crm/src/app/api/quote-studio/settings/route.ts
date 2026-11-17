import { saveStudioSettings } from '@/lib/quote-studio/service';
import { jsonBody, studioHandler } from '../http';

export const dynamic = 'force-dynamic';

export async function PUT(request: Request) {
  return studioHandler(async ({ workspaceId }) => {
    const saved = await saveStudioSettings(workspaceId, await jsonBody(request));
    return { ...saved, logo: undefined };
  }, { manage: true });
}
