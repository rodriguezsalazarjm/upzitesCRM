/** QA P14 (crm_pruebas): owner-a también es OWNER de "Visual Flow B" (infoproductos) para comparar dos rubros con el mismo usuario. */
import { prisma } from '../../src/lib/prisma';
const owner = await prisma.user.findFirstOrThrow({ where: { email: 'owner-a@visual.test' }, select: { id: true } });
const b = await prisma.workspace.findFirstOrThrow({ where: { name: 'Visual Flow B' }, select: { id: true } });
await prisma.workspaceMembership.upsert({
  where: { userId_workspaceId: { userId: owner.id, workspaceId: b.id } },
  create: { userId: owner.id, workspaceId: b.id, role: 'OWNER' },
  update: { role: 'OWNER', status: 'ACTIVE', planLimitedAt: null },
});
console.log(JSON.stringify({ workspaceB: b.id }));
await prisma.$disconnect();
