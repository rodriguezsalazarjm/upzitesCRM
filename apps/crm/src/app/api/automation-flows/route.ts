import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCurrentUser } from '@/lib/auth';
import { canManageAutomations } from '@/lib/automations/roles';
import { parseBody } from '@/lib/http';
import { createFlow } from '@/lib/automations/service';
import { AUTOMATION_TEMPLATES, generateQuickFlow, missingCapabilities } from '@/lib/automations/catalog';
import { prisma } from '@/lib/prisma';

const schema = z.object({ name: z.string().min(1).max(150), channel: z.enum(['INSTAGRAM', 'MESSENGER', 'WHATSAPP', 'TIKTOK']), templateId: z.string().optional(), quick: z.object({ kind: z.enum(['comment', 'resource', 'story', 'faq', 'qualify', 'sale', 'follow', 'handoff', 'cold', 'email']), accountId: z.string().optional(), keyword: z.string().optional(), match: z.enum(['EXACT', 'CONTAINS']).optional(), postId: z.string().optional(), text: z.string().optional(), publicReply: z.string().optional(), resource: z.string().url().or(z.literal('')).optional(), tag: z.string().optional(), followup: z.string().optional(), delayMinutes: z.number().positive().optional(), agentVersionId: z.string().optional(), productId: z.string().optional() }).optional() });
export async function POST(request: Request) {
  const user = await requireCurrentUser();
  if (!canManageAutomations(user.role)) return NextResponse.json({ message: 'Sin permiso para editar automatizaciones.' }, { status: 403 });
  const parsed = await parseBody(request, schema); if (!parsed.ok) return parsed.response;
  const { name, channel, quick, templateId } = parsed.data;
  const template = templateId ? AUTOMATION_TEMPLATES.find(t => t.id === templateId) : undefined;
  if (templateId && !template) return NextResponse.json({ message: 'Plantilla no encontrada.' }, { status: 404 });
  if (template && !template.supportedChannels.includes(channel)) return NextResponse.json({ message: 'Canal incompatible.' }, { status: 422 });
  if (template) {
    const account = await prisma.channelAccount.findFirst({ where: { id: quick?.accountId ?? '', workspaceId: user.workspace.id, channel } });
    const wa = channel === 'WHATSAPP' ? await prisma.whatsAppChannel.findFirst({ where: { workspaceId: user.workspace.id, status: 'CONNECTED' } }) : null;
    const missing = missingCapabilities(account ?? (wa ? { id: wa.id, channel, displayName: null, status: wa.status, capabilities: [] } : undefined), template.requiredCapabilities);
    if (missing.length) return NextResponse.json({ message: `Faltan capacidades: ${missing.join(', ')}` }, { status: 422 });
  }
  const graph = template || quick ? generateQuickFlow({ ...template?.config, ...quick, kind: template?.config.kind ?? quick!.kind }) : { trigger: { type: 'MANUAL' }, nodes: [{ id: 'start', type: 'END', position: { x: 100, y: 80 } }], edges: [] };
  const flow = await createFlow(user.workspace.id, user.id, name, channel, graph);
  return NextResponse.json({ data: { id: flow.id } }, { status: 201 });
}
