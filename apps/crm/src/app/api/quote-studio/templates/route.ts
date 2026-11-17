import { duplicateTemplate, saveTemplate } from '@/lib/quote-studio/service';
import { jsonBody, studioHandler } from '../http';

export const dynamic = 'force-dynamic';

/** Crear plantilla, o duplicar una con { duplicateOf }. */
export async function POST(request: Request) {
  return studioHandler(async ({ workspaceId }) => {
    const body = await jsonBody(request);
    return typeof body?.duplicateOf === 'string' ? duplicateTemplate(workspaceId, body.duplicateOf) : saveTemplate(workspaceId, body);
  }, { manage: true, status: 201 });
}
