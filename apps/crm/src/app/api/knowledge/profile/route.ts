import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { workspaceKnowledgeProfileSchema } from '@/lib/workspace-knowledge/rules';
import { getWorkspaceKnowledgeProfile, KnowledgeError, saveWorkspaceKnowledgeProfile } from '@/lib/workspace-knowledge/service';

export async function GET() {
  const user = await requireCurrentUser();
  return NextResponse.json({ data: await getWorkspaceKnowledgeProfile(user.workspace.id) });
}

export async function PATCH(request: Request) {
  const user = await requireCurrentUser();
  const parsed = await parseBody(request, workspaceKnowledgeProfileSchema);
  if (!parsed.ok) return parsed.response;
  try {
    return NextResponse.json({ data: await saveWorkspaceKnowledgeProfile({ userId: user.id, workspaceId: user.workspace.id, role: user.role }, parsed.data) });
  } catch (error) {
    if (error instanceof KnowledgeError) return NextResponse.json({ message: error.message }, { status: error.code === 'FORBIDDEN' ? 403 : 400 });
    throw error;
  }
}
