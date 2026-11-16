import { prisma } from '../../src/lib/prisma';
const run = await prisma.automationFlowRun.findFirst({ where: { flowId: process.argv[2] }, orderBy: { startedAt: 'desc' }, select: { error: true, channel: true } });
console.log(JSON.stringify(run));
await prisma.$disconnect();
