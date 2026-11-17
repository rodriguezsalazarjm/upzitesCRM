import { MailError, MAX_ATTACHMENTS_BYTES, sendMail } from '@/lib/mail/service';
import { mailHandler } from '../http';

export const dynamic = 'force-dynamic';

/** multipart: "data" (JSON con destinatarios, asunto, texto…) + "files" (adjuntos). */
export async function POST(request: Request) {
  return mailHandler(async ({ workspaceId, userId }) => {
    if (Number(request.headers.get('content-length') ?? 0) > MAX_ATTACHMENTS_BYTES * 1.5) throw new MailError('Los adjuntos superan 15 MB en total.');
    const form = await request.formData().catch(() => { throw new MailError('Formulario inválido.'); });
    let data: unknown;
    try { data = JSON.parse(String(form.get('data') ?? '')); } catch { throw new MailError('Formulario inválido.'); }
    const files = await Promise.all(form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0).slice(0, 10)
      .map(async (f) => ({ filename: f.name.slice(0, 200) || 'adjunto', mimeType: f.type || 'application/octet-stream', content: new Uint8Array(await f.arrayBuffer()) })));
    return sendMail(workspaceId, userId, data as never, files);
  });
}
