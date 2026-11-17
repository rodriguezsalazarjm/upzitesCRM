import { z } from 'zod';
import { duplicateSalesQuote, saveSalesQuote, salesQuoteAction, sendSalesQuote } from '@/lib/quote-studio/service';
import { jsonBody, studioHandler } from '../../http';

export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ id: string }> };

/** Guardar lo editado (los totales los recalcula el servidor). */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  return studioHandler(async ({ workspaceId, userId }) => saveSalesQuote(workspaceId, id, await jsonBody(request), userId));
}

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('duplicate') }),
  z.object({ action: z.literal('send'), channel: z.enum(['email', 'whatsapp', 'link']) }),
  z.object({ action: z.enum(['ready', 'new_version', 'accept', 'reject', 'cancel']) }),
]);

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  return studioHandler(async ({ workspaceId, userId }) => {
    const input = actionSchema.parse(await jsonBody(request));
    if (input.action === 'duplicate') return duplicateSalesQuote(workspaceId, id, userId);
    if (input.action === 'send') return sendSalesQuote(workspaceId, id, input.channel, userId);
    return salesQuoteAction(workspaceId, id, input.action, userId);
  });
}
