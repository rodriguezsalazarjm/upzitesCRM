import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
const schema = z.object({ id: z.string().optional(), type: z.enum(['TEXT', 'FAQ', 'POLICY']), title: z.string().trim().min(1).max(200), content: z.string().trim().min(1).max(20000), isActive: z.boolean().default(true) });
export async function POST(request: Request) {
  const user = await requireCurrentUser();
  if (!canManageChannels(user.role)) return NextResponse.json({ message: 'Sin permiso.' }, { status: 403 });
  const parsed = await parseBody(request, schema); if (!parsed.ok) return parsed.response;
  const { id, ...data } = parsed.data;
  if (id) {
    const result = await prisma.knowledgeSource.updateMany({ where: { id, workspaceId: user.workspace.id }, data });
    if (!result.count) return NextResponse.json({ message: 'Fuente no encontrada.' }, { status: 404 });
    return NextResponse.json({ data: { id } });
  }
  return NextResponse.json({ data: await prisma.knowledgeSource.create({ data: { ...data, workspaceId: user.workspace.id } }) }, { status: 201 });
}
export async function DELETE(request: Request) {
  const user = await requireCurrentUser();
  if (!canManageChannels(user.role)) return NextResponse.json({ message: 'Sin permiso.' }, { status: 403 });
  const id = new URL(request.url).searchParams.get('id') ?? '';
  await prisma.knowledgeSource.deleteMany({ where: { id, workspaceId: user.workspace.id } });
  return NextResponse.json({ data: { deleted: true } });
}
