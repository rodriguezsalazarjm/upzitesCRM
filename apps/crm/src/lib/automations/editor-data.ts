import { prisma } from '../prisma';
import type { AccountView } from './catalog';
export async function editorData(workspaceId: string) {
  const [social, wa, versions, products] = await Promise.all([
    prisma.channelAccount.findMany({ where: { workspaceId }, select: { id: true, channel: true, displayName: true, status: true, capabilities: true } }),
    prisma.whatsAppChannel.findMany({ where: { workspaceId, status: 'CONNECTED' }, select: { id: true, displayPhoneNumber: true, status: true } }),
    prisma.agentVersion.findMany({ where: { status: 'PUBLISHED', definition: { workspaceId, isActive: true } }, include: { definition: { select: { name: true } } } }),
    prisma.product.findMany({ where: { workspaceId, status: 'ACTIVE' }, select: { id: true, name: true } }),
  ]);
  const accounts: AccountView[] = [...social, ...wa.map(a => ({ id: a.id, channel: 'WHATSAPP' as const, displayName: a.displayPhoneNumber, status: a.status, capabilities: [] }))];
  return { accounts, agents: versions.map(v => ({ id: v.id, label: `${v.definition.name} · v${v.version}`, allowedTools: v.allowedTools })), products };
}
