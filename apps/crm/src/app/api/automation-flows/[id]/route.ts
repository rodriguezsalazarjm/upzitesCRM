import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { canManageAutomations } from '@/lib/automations/roles';
import { parseBody } from '@/lib/http';
import { FlowError, saveFlow, validatePublication } from '@/lib/automations/service';
import type { FlowGraph } from '@/lib/automations/schema';
import { prisma } from '@/lib/prisma';
const schema = z.object({ action: z.enum(['save', 'draft', 'publish', 'validate']), versionId: z.string(), updatedAt: z.string().optional(), name: z.string().min(1).max(150).optional(), graph: z.object({ trigger: z.record(z.unknown()), nodes: z.array(z.record(z.unknown())).max(200), edges: z.array(z.record(z.unknown())).max(400) }).optional() });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireCurrentUser();
  if (!canManageAutomations(user.role)) return NextResponse.json({ message: 'Sin permiso.' }, { status: 403 });
  const { id } = await params;
  const parsed = await parseBody(request, schema); if (!parsed.ok) return parsed.response;
  const input = parsed.data;
  try {
    if (input.action === 'validate') {
      const flow = await prisma.automationFlow.findFirst({ where: { id, workspaceId: user.workspace.id } });
      if (!flow) return NextResponse.json({ message: 'No encontrado.' }, { status: 404 });
      return NextResponse.json({ data: await validatePublication(user.workspace.id, flow.channelScope[0], input.graph) });
    }
    const version = await saveFlow(user.workspace.id, id, user.id, { ...input, action: input.action, graph: input.graph as FlowGraph | undefined });
    return NextResponse.json({ data: version });
  } catch (error) {
    if (error instanceof FlowError) return NextResponse.json({ message: error.message }, { status: 422 });
    throw error;
  }
}
