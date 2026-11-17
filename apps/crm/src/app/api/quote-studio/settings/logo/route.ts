import { LOGO_MAX_BYTES } from '@/lib/quote-studio/logo';
import { logoForClient, QuoteStudioError, saveLogo } from '@/lib/quote-studio/service';
import { studioHandler } from '../../http';

export const dynamic = 'force-dynamic';

/** Cuerpo = bytes del archivo. Se valida el contenido real (no la extensión ni el tipo declarado). */
export async function PUT(request: Request) {
  return studioHandler(async ({ workspaceId }) => {
    if (Number(request.headers.get('content-length') ?? 0) > LOGO_MAX_BYTES) throw new QuoteStudioError('El logo pesa más de 500 KB.');
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.byteLength) throw new QuoteStudioError('Elige una imagen.');
    return logoForClient(await saveLogo(workspaceId, bytes));
  }, { manage: true });
}

export async function DELETE() {
  return studioHandler(async ({ workspaceId }) => { await saveLogo(workspaceId, null); }, { manage: true });
}
