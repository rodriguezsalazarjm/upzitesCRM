import { z } from 'zod';
import { createSalesQuote } from '@/lib/quote-studio/service';
import { jsonBody, studioHandler } from '../http';

export const dynamic = 'force-dynamic';
const schema = z.object({ templateId: z.string().max(40).nullish(), contactId: z.string().max(40).nullish(), opportunityId: z.string().max(40).nullish() });

export async function POST(request: Request) {
  return studioHandler(async ({ workspaceId, userId }) => createSalesQuote(workspaceId, userId, schema.parse(await jsonBody(request))), { status: 201 });
}
