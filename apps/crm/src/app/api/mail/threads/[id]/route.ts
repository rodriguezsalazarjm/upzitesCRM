import { z } from 'zod';
import { linkThread, MailError, setThreadState } from '@/lib/mail/service';
import { mailHandler } from '../../http';

export const dynamic = 'force-dynamic';
const schema = z.object({ read: z.boolean().optional(), archive: z.boolean().optional(), link: z.unknown().optional() });

/** Leído/no leído, archivar/desarchivar o asociar a contacto, empresa u oportunidad. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return mailHandler(async ({ workspaceId, userId }) => {
    const input = schema.parse(await request.json().catch(() => { throw new MailError('El cuerpo debe ser JSON.'); }));
    if (input.link !== undefined) await linkThread(workspaceId, userId, id, input.link);
    if (input.read !== undefined || input.archive !== undefined) await setThreadState(workspaceId, userId, id, { read: input.read, archive: input.archive });
  });
}
