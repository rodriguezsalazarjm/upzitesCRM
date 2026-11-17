import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { attachmentBytes, MailError } from '@/lib/mail/service';

export const dynamic = 'force-dynamic';

/** Descarga un adjunto (se pide al proveedor en el momento; no se guarda en Upzites). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const user = await requireCurrentUser();
  const { id, attachmentId } = await params;
  try {
    const { meta, bytes } = await attachmentBytes(user.workspace.id, user.id, id, attachmentId);
    return new NextResponse(bytes as unknown as BodyInit, {
      headers: {
        // Siempre como descarga y sin adivinar el tipo: un HTML adjunto no se ejecuta en el dominio del CRM.
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(meta.filename)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof MailError) return NextResponse.json({ message: error.message }, { status: 404 });
    throw error;
  }
}
