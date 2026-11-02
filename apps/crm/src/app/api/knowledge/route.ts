import { NextResponse } from 'next/server';
import { requireCurrentUser } from '@/lib/auth';
import { parseBody } from '@/lib/http';
import { createFileSource, createManualSource, createUrlSource, KnowledgeError, listKnowledgeSources } from '@/lib/workspace-knowledge/service';
import { createManualSourceSchema, createUrlSourceSchema, KNOWLEDGE_LIMITS } from '@/lib/workspace-knowledge/rules';

export const runtime = 'nodejs';
// Procesar un PDF o una URL es síncrono (extracción + fragmentado) y puede tardar.
export const maxDuration = 60;

function responseFor(error: unknown) {
  if (error instanceof KnowledgeError) {
    const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 400;
    return NextResponse.json({ message: error.message }, { status });
  }
  return NextResponse.json({ message: error instanceof Error ? error.message : 'No se pudo procesar la fuente.' }, { status: 400 });
}

export async function GET() {
  const user = await requireCurrentUser();
  return NextResponse.json({ data: await listKnowledgeSources(user.workspace.id) });
}

export async function POST(request: Request) {
  const user = await requireCurrentUser();
  const actor = { userId: user.id, workspaceId: user.workspace.id, role: user.role };
  try {
    if ((request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return NextResponse.json({ message: 'Selecciona un archivo.' }, { status: 400 });
      if (file.size > KNOWLEDGE_LIMITS.fileBytes) return NextResponse.json({ message: 'El archivo supera 4 MB.' }, { status: 413 });
      const source = await createFileSource(actor, { title: String(form.get('title') ?? ''), fileName: file.name, declaredType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
      return NextResponse.json({ data: source }, { status: 201 });
    }
    const json = await request.clone().json().catch(() => ({})) as { kind?: unknown };
    if (json.kind === 'URL') {
      const parsed = await parseBody(request, createUrlSourceSchema);
      if (!parsed.ok) return parsed.response;
      return NextResponse.json({ data: await createUrlSource(actor, parsed.data) }, { status: 201 });
    }
    const parsed = await parseBody(request, createManualSourceSchema);
    if (!parsed.ok) return parsed.response;
    return NextResponse.json({ data: await createManualSource(actor, parsed.data) }, { status: 201 });
  } catch (error) {
    return responseFor(error);
  }
}
