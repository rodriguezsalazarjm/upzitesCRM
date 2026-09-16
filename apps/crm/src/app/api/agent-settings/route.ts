import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { canManageChannels } from '@/lib/conversations';
import { parseBody } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { ALL_TOOL_NAMES } from '@/lib/agents/tools';
const profile = z.object({ role: z.string().min(1), business: z.string(), tone: z.string(), language: z.string(), objective: z.string().min(1), sales: z.string(), escalation: z.string(), forbidden: z.string() });
const schema = z.object({ name: z.string().min(1).max(150), active: z.boolean(), profile, allowedTools: z.array(z.string()).refine(v => v.every(t => ALL_TOOL_NAMES.includes(t))), maxSteps: z.number().int().min(1).max(15) });
export async function POST(request: Request) {
  const user = await requireCurrentUser(); if (!canManageChannels(user.role)) return NextResponse.json({ message: 'Sin permiso.' }, { status: 403 });
  const parsed = await parseBody(request, schema); if (!parsed.ok) return parsed.response;
  const input = parsed.data;
  const definition = await prisma.agentDefinition.upsert({ where: { workspaceId_key: { workspaceId: user.workspace.id, key: 'SALES' } }, create: { workspaceId: user.workspace.id, key: 'SALES', name: input.name, isActive: input.active }, update: { name: input.name, isActive: input.active } });
  const version = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM agent_definitions WHERE id = ${definition.id} FOR UPDATE`;
    const last = await tx.agentVersion.findFirst({ where: { agentDefinitionId: definition.id }, orderBy: { version: 'desc' } });
    return tx.agentVersion.create({ data: { agentDefinitionId: definition.id, version: (last?.version ?? 0) + 1, instructions: Object.entries(input.profile).map(([key, value]) => `${key}: ${value}`).join('\n'), options: { profile: input.profile }, model: last?.model ?? 'gpt-5-mini', allowedTools: input.allowedTools, maxSteps: input.maxSteps, createdById: user.id } });
  });
  return NextResponse.json({ data: { definitionId: definition.id, versionId: version.id } });
}
