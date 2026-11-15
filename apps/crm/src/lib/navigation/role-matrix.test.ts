import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import test from 'node:test';
import { WorkspaceRole } from '../../../generated/prisma/enums';
import { canManageWorkspaceSettings, roleAllows } from '../workspace-roles';
import { NAV_ITEMS, type NavItemDef } from './items';

/**
 * Matriz rol ↔ ruta (P0-E). Evita que el sidebar esconda algo que el servidor
 * deja abrir, o al reves:
 *
 *  1. Todo modulo con `minRole` protege su pagina con
 *     `requireModuleAccess('<id>')` (lee el MISMO minRole del catalogo).
 *  2. Nadie usa `requireModuleAccess` con un modulo que no declara minRole ni
 *     fuera de la pagina de ese modulo.
 *  3. Las APIs administrativas (configuracion, integraciones, publicacion,
 *     billing) comprueban el rol en el servidor.
 */

const root = process.cwd();
const posix = (file: string) => file.split(sep).join('/');
const pageOf = (item: NavItemDef) => join(root, 'src/app/(dashboard)', item.href, 'page.tsx');

function files(dir: string, out: string[] = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

const restricted = (NAV_ITEMS as readonly NavItemDef[]).filter((item) => item.minRole);

test('hay al menos un modulo restringido por rol (billing)', () => {
  assert.ok(restricted.some((item) => item.id === 'billing' && item.minRole === WorkspaceRole.ADMIN));
});

test('1. cada modulo con minRole protege su pagina en el servidor', () => {
  for (const item of restricted) {
    const page = pageOf(item);
    assert.ok(existsSync(page), `${item.id}: no existe ${posix(page)}`);
    assert.match(readFileSync(page, 'utf8'), new RegExp(`requireModuleAccess\\('${item.id}'\\)`), `${item.id}: la pagina no llama requireModuleAccess('${item.id}')`);
  }
});

test('2. requireModuleAccess solo en la pagina del modulo y solo para modulos con minRole', () => {
  for (const file of files(join(root, 'src/app'))) {
    for (const match of readFileSync(file, 'utf8').matchAll(/requireModuleAccess\('([^']+)'\)/g)) {
      const item = restricted.find((candidate) => candidate.id === match[1]);
      assert.ok(item, `${posix(file)}: '${match[1]}' no declara minRole en NAV_ITEMS`);
      assert.equal(posix(file), posix(pageOf(item)), `${match[1]}: guard fuera de su pagina`);
    }
  }
});

/** APIs que administran el workspace: siempre con chequeo de rol en el servidor. */
const ADMIN_APIS = [
  'billing/checkout/route.ts',
  'pipeline-stages/route.ts',
  'pipeline-stages/[id]/route.ts',
  'onboarding/profile/route.ts',
  'onboarding/activate/route.ts',
  'workspace/setup/route.ts',
  'workspace/preset/route.ts',
  'ops/flags/route.ts',
  'messaging-policy/route.ts',
  'agents/[id]/publish/route.ts',
  'pricing-rule-sets/route.ts',
  'pricing-rule-sets/[id]/publish/route.ts',
  'pricing-rule-sets/[id]/archive/route.ts',
  'email/domains/route.ts',
  'email/templates/[id]/publish/route.ts',
  'journeys/[id]/publish/route.ts',
  'integrations/whatsapp/connect/route.ts',
  'integrations/whatsapp/disconnect/route.ts',
  // Punto 8: Channel Manager de WhatsApp.
  'integrations/whatsapp/status/route.ts',
  'integrations/whatsapp/embedded-signup/route.ts',
  'integrations/whatsapp/channels/[id]/route.ts',
  'integrations/whatsapp/channels/[id]/verify/route.ts',
  'integrations/whatsapp/channels/[id]/disconnect/route.ts',
  'integrations/whatsapp/channels/[id]/test-webhook/route.ts',
  'integrations/whatsapp/channels/[id]/test-send/route.ts',
  'integrations/shopify/connect/route.ts',
  'integrations/shopify/disconnect/route.ts',
  'integrations/mercado-pago/connect/route.ts',
  'integrations/mercado-pago/disconnect/route.ts',
  'integrations/channels/[channel]/connect/route.ts',
  'integrations/channels/[channel]/disconnect/route.ts',
  // P0-F: gestion de equipo (permisos en lib/team, decididos en el servidor).
  'team/invitations/route.ts',
  'team/invitations/[id]/route.ts',
  'team/members/[userId]/route.ts',
];
const ROLE_CHECK = /\bcan(Manage|Approve|Activate|Publish)\w*\(|roleAllows\(|hasWorkspaceRole\(|WorkspaceRole\.(OWNER|ADMIN)|completeOnboarding\(|applyRecommendedPreset\(|activateWorkspace\(|suspendWorkspace\(|inviteTeamMember\(|changeWorkspaceRole\(|suspendMember\(|reactivateMember\(|revokeTeamInvitation\(|resendTeamInvitation\(/;
// Los ultimos cuatro reciben el rol del contexto y lanzan FORBIDDEN dentro del lib.

test('3. las APIs administrativas comprueban el rol en el servidor', () => {
  for (const route of ADMIN_APIS) {
    const file = join(root, 'src/app/api', route);
    assert.ok(existsSync(file), `no existe ${route}`);
    assert.match(readFileSync(file, 'utf8'), ROLE_CHECK, `${route}: sin chequeo de rol`);
  }
});

test('jerarquia: MEMBER < ADMIN < OWNER; configuracion = OWNER/ADMIN', () => {
  assert.equal(roleAllows(WorkspaceRole.MEMBER, WorkspaceRole.ADMIN), false);
  assert.equal(roleAllows(WorkspaceRole.ADMIN, WorkspaceRole.ADMIN), true);
  assert.equal(roleAllows(WorkspaceRole.OWNER, WorkspaceRole.ADMIN), true);
  assert.equal(roleAllows(WorkspaceRole.MEMBER, undefined), true);
  assert.deepEqual([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.MEMBER].map(canManageWorkspaceSettings), [true, true, false]);
});

test('onboarding: ninguna ruta obliga a pasar por /bienvenida', () => {
  for (const file of files(join(root, 'src'))) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /redirect\(['"`]\/bienvenida/, `${posix(file)} redirige a /bienvenida`);
  }
});
