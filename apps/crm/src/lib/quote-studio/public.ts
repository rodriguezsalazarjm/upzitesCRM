import { z } from 'zod';
import { recordAudit } from '../domain/audit';
import { crossTenantPrisma } from '../prisma';
import { layoutQuote } from './layout';
import { tryDecodeLogo } from './logo';
import { writeQuotePdf } from './pdf';
import { hashPublicToken, type QuoteSnapshot } from './service';

/**
 * P37: cotización pública (/cotizacion/[token]). Sin sesión: el token (hash
 * único) es la autorización y todo queda acotado a ESA cotización. Muestra
 * siempre lo último que se envió (el snapshot), nunca el borrador en edición.
 */

const ANSWERABLE = ['SENT', 'VIEWED'];

export async function resolvePublicQuote(token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const quote = await crossTenantPrisma.salesQuote.findUnique({
    where: { publicTokenHash: hashPublicToken(token) },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
  });
  const latest = quote?.versions[0];
  if (!quote || !latest || quote.status === 'CANCELLED') return null;
  let status = quote.status;
  // Vencida: se marca al consultarla (sin cron) si no se respondió a tiempo.
  if (ANSWERABLE.includes(status) && quote.validUntil && quote.validUntil < now) {
    await crossTenantPrisma.salesQuote.updateMany({ where: { id: quote.id, status }, data: { status: 'EXPIRED' } });
    status = 'EXPIRED';
  } else if (status === 'SENT') {
    await crossTenantPrisma.salesQuote.updateMany({ where: { id: quote.id, status: 'SENT' }, data: { status: 'VIEWED', viewedAt: now } });
    status = 'VIEWED';
  }
  return {
    id: quote.id,
    workspaceId: quote.workspaceId,
    status,
    // Si se está editando una versión nueva, el cliente sigue viendo (y respondiendo) la enviada.
    editingNewVersion: quote.version > latest.version,
    version: latest.version,
    snapshot: latest.snapshot as unknown as QuoteSnapshot,
    responseComment: quote.responseComment,
  };
}

export const responseSchema = z.object({ decision: z.enum(['accept', 'reject']), comment: z.string().trim().max(1000).default('') });

export async function respondPublicQuote(token: string, raw: unknown, now = new Date()) {
  const input = responseSchema.parse(raw);
  const quote = await resolvePublicQuote(token, now);
  if (!quote) return { ok: false as const, message: 'Esta cotización ya no está disponible.' };
  if (!ANSWERABLE.includes(quote.status)) return { ok: false as const, message: quote.status === 'EXPIRED' ? 'La cotización venció: pide una nueva.' : 'Esta cotización ya fue respondida.' };
  if (quote.editingNewVersion) return { ok: false as const, message: 'El vendedor está preparando una versión nueva de esta cotización.' };
  const accepted = input.decision === 'accept';
  const updated = await crossTenantPrisma.salesQuote.updateMany({
    where: { id: quote.id, status: { in: ANSWERABLE as ('SENT' | 'VIEWED')[] } },
    data: accepted ? { status: 'ACCEPTED', acceptedAt: now, responseComment: input.comment || null } : { status: 'REJECTED', rejectedAt: now, responseComment: input.comment || null },
  });
  if (!updated.count) return { ok: false as const, message: 'Esta cotización ya fue respondida.' };
  await recordAudit({ workspaceId: quote.workspaceId, action: `sales_quote.public_${input.decision}`, entity: 'SalesQuote', entityId: quote.id, metadata: { version: quote.version, comment: input.comment || null } }, crossTenantPrisma);
  return { ok: true as const, status: accepted ? 'ACCEPTED' : 'REJECTED' };
}

/** PDF de un snapshot (o del documento actual): mismo maquetador que la vista previa. */
export function snapshotPdf(snapshot: QuoteSnapshot) {
  const logo = snapshot.logo ? tryDecodeLogo(Buffer.from(snapshot.logo.dataUrl.split(',')[1] ?? '', 'base64')) : null;
  const doc = { ...snapshot.doc, logo: logo ? { width: logo.width, height: logo.height } : null };
  return writeQuotePdf(layoutQuote(doc), logo, snapshot.doc.number);
}
