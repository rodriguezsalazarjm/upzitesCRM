/** QA P16 (crm_pruebas): simula que la cuenta nueva compró un plan (COMP PRO), sin pasar por Mercado Pago. */
import { readFileSync } from 'node:fs';
import { prisma } from '../../src/lib/prisma';
import { assignCompSubscription } from '../../src/lib/billing/subscription-admin';
const { email } = JSON.parse(readFileSync('.local-visual/p16-account.json', 'utf8')) as { email: string };
const user = await prisma.user.findFirstOrThrow({ where: { email }, select: { memberships: { select: { workspaceId: true } } } });
await assignCompSubscription({ workspaceId: user.memberships[0].workspaceId, planCode: 'PRO', via: 'cli', reason: 'QA P16 onboarding' });
console.log('COMP PRO asignado');
await prisma.$disconnect();
