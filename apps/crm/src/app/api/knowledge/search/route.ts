import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { retrieveWorkspaceKnowledge } from '@/lib/workspace-knowledge/retrieval';

const schema = z.object({ query: z.string().trim().min(1).max(500) }).strict();

/** Muestra qué fragmentos recuperaría el agente para una pregunta. No llama a la IA. */
export async function POST(request: Request) {
  const user = await requireCurrentUser();
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const chunks = await retrieveWorkspaceKnowledge(user.workspace.id, parsed.data.query);
  return NextResponse.json({ data: chunks.map(({ id, sourceId, sourceType, title, content }) => ({ id, sourceId, sourceType, title, content })) });
}
