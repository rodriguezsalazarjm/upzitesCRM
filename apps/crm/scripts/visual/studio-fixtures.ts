import { readFileSync, writeFileSync } from 'node:fs';
import { PlanCode, WorkspaceRole } from '../../generated/prisma/client';
import { prisma } from '../../src/lib/prisma';
import { createCustomerWorkspace } from '../../src/lib/subscription';
import { assignCompSubscription } from '../../src/lib/billing/subscription-admin';
import { addMembershipWithinPlan } from '../../src/lib/entitlements/growth';
import { isLocalDemo } from '../../src/lib/testing/local-mode';

/**
 * Base de autenticacion para el E2E del Product Sales Studio (Punto 2), en
 * crm_pruebas y bajo el preload visual. Solo cuentas y negocios: NINGUN
 * producto. Todo el catalogo lo crea el E2E desde la interfaz.
 *
 *  - studio-owner@visual.test: OWNER de "Studio QA A" y ADMIN de "Studio QA B"
 *    (para probar que cambiar de negocio no mezcla catalogos).
 *  - Ambos negocios en SCALE (COMP): commerce habilitado.
 */
if (!isLocalDemo()) throw new Error('Usa el preload visual protegido.');
const credentials = JSON.parse(readFileSync('.local-visual/accounts.json', 'utf8')) as { password: string };
const EMAIL = 'studio-owner@visual.test';
const HELPER = 'studio-owner-b@visual.test';
const NAMES = ['Studio QA A', 'Studio QA B'];

try {
  for (const email of [EMAIL, HELPER]) {
    const old = await prisma.user.findUnique({ where: { email }, include: { memberships: { include: { workspace: true } } } });
    if (!old) continue;
    if (old.memberships.some((m) => !NAMES.includes(m.workspace.name))) throw new Error('Cuenta de fixture ocupada.');
    await prisma.workspace.deleteMany({ where: { id: { in: old.memberships.map((m) => m.workspaceId) } } });
    await prisma.user.delete({ where: { id: old.id } });
  }

  const a = await createCustomerWorkspace({ companyName: NAMES[0], ownerName: 'Dueña Studio', email: EMAIL, password: credentials.password });
  const b = await createCustomerWorkspace({ companyName: NAMES[1], ownerName: 'Dueño B', email: HELPER, password: credentials.password });
  for (const workspace of [a.workspace, b.workspace]) {
    await assignCompSubscription({ workspaceId: workspace.id, planCode: PlanCode.SCALE, via: 'cli', reason: 'fixture E2E Product Sales Studio' });
    await prisma.workspaceActivation.upsert({ where: { workspaceId: workspace.id }, create: { workspaceId: workspace.id, status: 'ACTIVE', activatedAt: new Date() }, update: { status: 'ACTIVE' } });
  }
  await addMembershipWithinPlan({ workspaceId: b.workspace.id, userId: a.user.id, role: WorkspaceRole.ADMIN });

  writeFileSync(
    '.local-visual/studio.json',
    JSON.stringify({ email: EMAIL, workspaceA: { id: a.workspace.id, name: NAMES[0] }, workspaceB: { id: b.workspace.id, name: NAMES[1] } }, null, 2),
  );
  console.log('Fixture Studio listo: una cuenta OWNER de A y ADMIN de B, ambos SCALE, sin productos.');
} finally {
  await prisma.$disconnect();
}
