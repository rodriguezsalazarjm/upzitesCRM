/**
 * Hito P18 (crm_pruebas): el checklist refleja el estado REAL.
 *  - Cuenta nueva de P16: producto en borrador → "Crea un producto" pendiente; activo → listo.
 *  - owner-a (Visual Flow A): flujo publicado pero pausado por el plan → "Crea una automatización" pendiente.
 * Deja todo como estaba.
 */
import { readFileSync } from 'node:fs';
import { prisma } from '../../src/lib/prisma';
import { checklistEvidence } from '../../src/lib/workspace-experience';

const { email } = JSON.parse(readFileSync('.local-visual/p16-account.json', 'utf8')) as { email: string };
const fresh = (await prisma.user.findFirstOrThrow({ where: { email }, select: { memberships: { select: { workspaceId: true } } } })).memberships[0].workspaceId;
const a = (await prisma.workspace.findFirstOrThrow({ where: { name: { startsWith: 'Visual Flow A' } }, select: { id: true } })).id;
const results: Record<string, boolean> = {};

const product = await prisma.product.findFirstOrThrow({ where: { workspaceId: fresh }, orderBy: { createdAt: 'asc' } });
try {
  await prisma.product.update({ where: { id: product.id }, data: { status: 'DRAFT' } });
  results.productDraft = (await checklistEvidence(fresh)).create_product;
  await prisma.product.update({ where: { id: product.id }, data: { status: 'ACTIVE' } });
  results.productActive = (await checklistEvidence(fresh)).create_product;
} finally {
  await prisma.product.update({ where: { id: product.id }, data: { status: product.status } });
}

const flows = await prisma.automationFlow.findMany({ where: { workspaceId: a, status: 'PUBLISHED', planLimitedAt: null }, select: { id: true } });
const rules = await prisma.automationRule.findMany({ where: { workspaceId: a, isActive: true, presetKey: null, planLimitedAt: null }, select: { id: true } });
results.automationBefore = (await checklistEvidence(a)).create_automation;
try {
  const now = new Date();
  await prisma.automationFlow.updateMany({ where: { id: { in: flows.map((f) => f.id) } }, data: { planLimitedAt: now } });
  await prisma.automationRule.updateMany({ where: { id: { in: rules.map((r) => r.id) } }, data: { planLimitedAt: now } });
  results.automationPausedByPlan = (await checklistEvidence(a)).create_automation;
} finally {
  await prisma.automationFlow.updateMany({ where: { id: { in: flows.map((f) => f.id) } }, data: { planLimitedAt: null } });
  await prisma.automationRule.updateMany({ where: { id: { in: rules.map((r) => r.id) } }, data: { planLimitedAt: null } });
}
results.automationRestored = (await checklistEvidence(a)).create_automation;

console.log(JSON.stringify(results));
const ok = !results.productDraft && results.productActive && results.automationBefore && !results.automationPausedByPlan && results.automationRestored;
await prisma.$disconnect();
if (!ok) process.exit(1);
