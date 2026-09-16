import { readFileSync, writeFileSync } from 'node:fs';
import { prisma } from '../../src/lib/prisma';
import { createCustomerWorkspace } from '../../src/lib/subscription';
import { ALL_TOOL_NAMES } from '../../src/lib/agents/tools';
import { isLocalDemo } from '../../src/lib/testing/local-mode';
if (!isLocalDemo()) throw new Error('Usa el preload visual protegido.');
const credentials = JSON.parse(readFileSync('.local-visual/accounts.json', 'utf8'));
const result: Record<string, unknown> = {};
try {
  for (const key of ['a', 'b']) {
    const email = `c2-owner-${key}@visual.test`;
    const old = await prisma.user.findFirst({ where: { email }, include: { workspace: true } });
    if (old && old.workspace.name !== `C2 Flow ${key.toUpperCase()}`) throw new Error('Cuenta de fixture ocupada.');
    if (old) await prisma.workspace.delete({ where: { id: old.workspaceId } });
    const { workspace, user } = await createCustomerWorkspace({ companyName: `C2 Flow ${key.toUpperCase()}`, ownerName: `Owner C2 ${key}`, email, password: credentials.password });
    await prisma.workspaceActivation.upsert({ where: { workspaceId: workspace.id }, create: { workspaceId: workspace.id, status: 'ACTIVE', activatedAt: new Date() }, update: { status: 'ACTIVE' } });
    const definition = await prisma.agentDefinition.findFirstOrThrow({ where: { workspaceId: workspace.id, key: 'SALES' } });
    const version = await prisma.agentVersion.findFirstOrThrow({ where: { agentDefinitionId: definition.id } });
    await prisma.agentVersion.update({ where: { id: version.id }, data: { status: 'PUBLISHED', publishedAt: new Date(), allowedTools: ALL_TOOL_NAMES, maxSteps: 8 } });
    const product = await prisma.product.create({ data: { workspaceId: workspace.id, name: key === 'a' ? '5 Minutos con Dios' : 'Producto exclusivo B', status: 'ACTIVE', type: 'DIGITAL', variants: { create: { name: 'Acceso digital', priceClp: key === 'a' ? 5900 : 12900, isDefault: true } }, assets: { create: { workspaceId: workspace.id, name: 'Recurso demo', kind: 'LINK', target: 'http://localhost:3101/sin-conexion' } } } });
    await prisma.knowledgeSource.create({ data: { workspaceId: workspace.id, type: 'FAQ', title: '¿Cuál es el horario?', content: key === 'a' ? 'Horario exclusivo A: lunes a viernes de 9 a 18.' : 'Horario exclusivo B: sábados de 10 a 14.' } });
    result[key] = { workspaceId: workspace.id, ownerId: user.id, email, agentId: definition.id, versionId: version.id, productId: product.id };
  }
  writeFileSync('.local-visual/c2.json', JSON.stringify(result, null, 2));
  console.log('Fixtures C2 A/B preparados en crm_pruebas, con agentes fake y catálogos separados.');
} finally { await prisma.$disconnect(); }
