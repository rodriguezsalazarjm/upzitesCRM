import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { updateSourceSchema } from '@/lib/workspace-knowledge/rules';
import { deleteKnowledgeSource, getKnowledgeSourcePreview, KnowledgeError, updateKnowledgeSource } from '@/lib/workspace-knowledge/service';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };
const statusFor = (error: KnowledgeError) => error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 400;

export async function GET(_request: Request, { params }: Params) {
  const user = await requireCurrentUser();
  try { return NextResponse.json({ data: await getKnowledgeSourcePreview(user.workspace.id, (await params).id) }); }
  catch (error) { if (error instanceof KnowledgeError) return NextResponse.json({ message: error.message }, { status: statusFor(error) }); throw error; }
}

export async function PATCH(request: Request, { params }: Params) {
  const user = await requireCurrentUser();
  const parsed = await parseBody(request, updateSourceSchema);
  if (!parsed.ok) return parsed.response;
  try { return NextResponse.json({ data: await updateKnowledgeSource({ userId: user.id, workspaceId: user.workspace.id, role: user.role }, (await params).id, parsed.data) }); }
  catch (error) { if (error instanceof KnowledgeError) return NextResponse.json({ message: error.message }, { status: statusFor(error) }); throw error; }
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await requireCurrentUser();
  try { await deleteKnowledgeSource({ userId: user.id, workspaceId: user.workspace.id, role: user.role }, (await params).id); return NextResponse.json({ data: { deleted: true } }); }
  catch (error) { if (error instanceof KnowledgeError) return NextResponse.json({ message: error.message }, { status: statusFor(error) }); throw error; }
}
