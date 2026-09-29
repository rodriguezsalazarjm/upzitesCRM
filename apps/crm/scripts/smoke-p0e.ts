/**
 * P0-E: Adaptive Workspace + Personalization + Onboarding.
 *
 * Uso, desde apps/crm (exige TEST_DATABASE_URL con el marcador de base aislada):
 *   pnpm exec tsx scripts/smoke-p0e.ts
 */
import './fixtures/test-environment';
import { randomUUID } from 'node:crypto';
import {
  JourneyEnrollmentStatus,
  JourneyStatus,
  JourneyTrigger,
  OrderStatus,
  PlanCode,
  PlatformRole,
  WorkspaceRole,
} from '../generated/prisma/client';
import { crossTenantPrisma, prisma } from '../src/lib/prisma';
import { createCustomerWorkspace } from '../src/lib/subscription';
import { assignCompSubscription } from '../src/lib/billing/subscription-admin';
import { addMembershipWithinPlan } from '../src/lib/entitlements/growth';
import { assertFeature, isEntitlementError } from '../src/lib/entitlements';
import { createPlatformClient } from '../src/lib/platform/clients';
import { getPreference } from '../src/lib/preferences';
import { sidebarWidthFor } from '../src/lib/navigation/sidebar-layout';
import { requireCurrentUser } from '../src/lib/auth';
import { shouldShowTutorial } from '../src/lib/tutorials';
import { getChecklist, getWorkspaceExperience, loadDashboard, type WorkspaceExperience } from '../src/lib/workspace-experience';
import { PRESETS, presetId } from '../src/lib/workspace-presets';
import { asUser, asUserCapturingSession } from './fixtures/request-context';
import { POST as setupRoute } from '../src/app/api/workspace/setup/route';
import { POST as presetRoute } from '../src/app/api/workspace/preset/route';
import { PATCH as profileRoute } from '../src/app/api/onboarding/profile/route';
import { PATCH as preferencesRoute } from '../src/app/api/preferences/route';
import { POST as dashboardRoute } from '../src/app/api/preferences/dashboard/route';
import { POST as tutorialsRoute } from '../src/app/api/preferences/tutorials/route';
import { POST as switchRoute } from '../src/app/api/workspaces/switch/route';
import { POST as checkoutRoute } from '../src/app/api/billing/checkout/route';
import { POST as stageCreate } from '../src/app/api/pipeline-stages/route';
import { DELETE as stageDelete, PATCH as stagePatch } from '../src/app/api/pipeline-stages/[id]/route';
import { POST as createContact } from '../src/app/api/contacts/route';
import BillingPage from '../src/app/(dashboard)/billing/page';
import DashboardPage from '../src/app/(dashboard)/dashboard/page';

const results: { name: string; ok: boolean }[] = [];
let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FALLA'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const stamp = Date.now();
const createdWorkspaces: string[] = [];
const createdUsers: string[] = [];
const cli = { via: 'cli' as const, reason: 'smoke p0e' };
let ipSeq = 1;
const ip = () => `198.18.${Math.floor(stamp / 1000) % 250}.${(ipSeq++ % 250) + 1}`;
type Session = { id: string; workspaceId: string | null };

async function makeWorkspace(suffix: string, plan: PlanCode | null = PlanCode.SCALE) {
  const email = `owner-${suffix}-${stamp}@p0e.test`;
  const created = await createCustomerWorkspace({ companyName: `p0e-${suffix}-${stamp}`, ownerName: `Owner ${suffix}`, email, password: 'contrasena-de-prueba-1234' });
  createdWorkspaces.push(created.workspace.id);
  createdUsers.push(created.user.id);
  if (plan && plan !== PlanCode.FREE) await assignCompSubscription({ workspaceId: created.workspace.id, planCode: plan, ...cli });
  return { workspaceId: created.workspace.id, ownerId: created.user.id, session: { id: created.user.id, workspaceId: created.workspace.id } as Session };
}

function req(path: string, body?: unknown, method = 'POST') {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function setup(session: Session, body: Record<string, unknown>) {
  return asUser(session, () => setupRoute(req('/api/workspace/setup', body)));
}

async function experienceOf(session: Session) {
  return asUser(session, async () => {
    const user = await requireCurrentUser();
    return getWorkspaceExperience({ workspaceId: user.workspace.id, userId: user.id, role: user.role });
  });
}

const primary = (x: WorkspaceExperience) => x.navigation.primary.map((e) => e.id);
const profileOf = (workspaceId: string) => prisma.workspaceProfile.findUniqueOrThrow({ where: { workspaceId } });
const SERVICES_BODY = { businessType: 'SERVICES', primaryGoal: 'LEADS', preferredChannels: ['WHATSAPP', 'WEB', 'WHATSAPP'], teamSize: 'SMALL' };
const INFO_BODY = { businessType: 'ECOMMERCE', commerceSubtype: 'INFOPRODUCT', primaryGoal: 'SALES', preferredChannels: ['INSTAGRAM', 'WHATSAPP'], teamSize: 'SOLO' };

// =============================================================================
console.log('\n== Una cuenta, dos negocios (SERVICES e INFOPRODUCT) ==');
const S = await makeWorkspace('services');
const I = await makeWorkspace('info');
const U = S.ownerId;
await addMembershipWithinPlan({ workspaceId: I.workspaceId, userId: U, role: WorkspaceRole.OWNER });
const uInS: Session = { id: U, workspaceId: S.workspaceId };
const uInI: Session = { id: U, workspaceId: I.workspaceId };

const setupS = await setup(uInS, SERVICES_BODY);
const setupI = await setup(uInI, INFO_BODY);
const profS = await profileOf(S.workspaceId);
const profI = await profileOf(I.workspaceId);
check('25. Onboarding SERVICES: perfil + preset services + onboardingCompletedAt', setupS.status === 200 && profS.businessType === 'SERVICES' && profS.presetKey === 'services' && Boolean(profS.onboardingCompletedAt));
check('27. Onboarding INFOPRODUCT: ECOMMERCE + INFOPRODUCT → preset infoproduct', setupI.status === 200 && profI.businessType === 'ECOMMERCE' && profI.commerceSubtype === 'INFOPRODUCT' && profI.presetKey === 'infoproduct');
check('28. primaryGoal guardado', profS.primaryGoal === 'LEADS' && profI.primaryGoal === 'SALES');
check('29. preferredChannels guardado (sin duplicados)', JSON.stringify(profS.preferredChannels) === JSON.stringify(['WHATSAPP', 'WEB']));
check('30. teamSize guardado', profS.teamSize === 'SMALL' && profI.teamSize === 'SOLO');
check('37. Version del preset almacenada', profS.presetVersion === PRESETS.services.version && presetId({ key: 'services', version: profS.presetVersion! }) === 'services:v1');

let xS = await experienceOf(uInS);
const xI = await experienceOf(uInI);
check('1. Misma cuenta es OWNER en un workspace SERVICES y en uno INFOPRODUCT', xS.preset.preset.key === 'services' && xI.preset.preset.key === 'infoproduct');
check('2. Cada workspace obtiene una navegacion distinta', JSON.stringify(primary(xS)) !== JSON.stringify(primary(xI)), `${primary(xS).slice(0, 4)} | ${primary(xI).slice(0, 4)}`);
check(
  '7. Preset SERVICES: Inicio, Inbox, Contactos, Pipeline, Cotizaciones, Actividades, Automatizaciones, IA, Analitica',
  JSON.stringify(primary(xS).slice(0, 9)) === JSON.stringify(['home', 'inbox', 'contacts', 'pipeline', 'quotes', 'activities', 'automations', 'ai', 'analytics']),
);
check(
  '9. Preset INFOPRODUCT: Inicio, Inbox, Pedidos, Productos, Contactos, Recuperacion, Automatizaciones, IA, Analitica',
  JSON.stringify(primary(xI).slice(0, 9)) === JSON.stringify(['home', 'inbox', 'orders', 'products', 'contacts', 'recovery', 'automations', 'ai', 'analytics']),
);
check('13. SERVICES + SCALE: Pedidos no ocupa espacio aunque el plan lo permite (oculto, recuperable)', !primary(xS).includes('orders') && xS.navigation.hidden.some((e) => e.id === 'orders' && !e.locked));

// =============================================================================
console.log('\n== Sidebar y preferencias USUARIO x WORKSPACE ==');
const patch = (session: Session, body: unknown) => asUser(session, () => preferencesRoute(req('/api/preferences', body, 'PATCH')));
const wide = await patch(uInS, { sidebarWidth: 300 });
const collapse = await patch(uInS, { sidebarCollapsed: true });
const clamp = await patch(uInI, { sidebarWidth: 900 });
const prefS = await getPreference({ userId: U, workspaceId: S.workspaceId });
const prefI = await getPreference({ userId: U, workspaceId: I.workspaceId });
check('4. El ancho del sidebar persiste (y se acota a 220–340)', wide.status === 200 && prefS.sidebarWidth === 300 && clamp.status === 200 && prefI.sidebarWidth === 340);
check('5. Colapsar persiste', collapse.status === 200 && prefS.sidebarCollapsed === true);
check('3. Las preferencias de A no afectan a B', prefI.sidebarCollapsed === false && prefI.sidebarWidth === 340 && prefS.sidebarWidth === 300);
check('6. Movil ignora el ancho de escritorio', sidebarWidthFor(prefS, { mobile: true }) === 248 && sidebarWidthFor(prefS, { mobile: false }) === 72);
const foreign = await patch(uInS, { sidebarWidth: 250, userId: I.ownerId, workspaceId: I.workspaceId });
check('   Seguridad: no se puede apuntar a otro usuario/workspace (400, cuerpo estricto)', foreign.status === 400 && (await getPreference({ userId: U, workspaceId: S.workspaceId })).sidebarWidth === 300);

// =============================================================================
console.log('\n== Presets ECOMMERCE, APPOINTMENTS y GENERAL ==');
const E = await makeWorkspace('ecommerce');
const setupE = await setup(E.session, { businessType: 'ECOMMERCE', commerceSubtype: 'PHYSICAL_PRODUCTS', primaryGoal: 'SALES', preferredChannels: ['ONLINE_STORE'], teamSize: 'MEDIUM' });
const xE = await experienceOf(E.session);
check('26. Onboarding ECOMMERCE fisico → preset ecommerce', setupE.status === 200 && (await profileOf(E.workspaceId)).commerceSubtype === 'PHYSICAL_PRODUCTS' && xE.preset.preset.key === 'ecommerce');
check('8. Preset ECOMMERCE: pedidos y productos primero', JSON.stringify(primary(xE).slice(0, 4)) === JSON.stringify(['home', 'inbox', 'orders', 'products']) && !primary(xE).includes('pipeline'));
const A = await makeWorkspace('appointments');
await setup(A.session, { businessType: 'APPOINTMENTS', primaryGoal: 'CONVERSATIONS', preferredChannels: ['WHATSAPP'], teamSize: 'SOLO' });
const xA = await experienceOf(A.session);
const allA = [...xA.navigation.primary, ...xA.navigation.system, ...xA.navigation.hidden];
check('10. APPOINTMENTS no inventa Agenda', xA.preset.preset.key === 'appointments' && JSON.stringify(primary(xA).slice(0, 5)) === JSON.stringify(['home', 'inbox', 'contacts', 'automations', 'ai']) && !allA.some((e) => /agenda|calendar/i.test(`${e.id}${e.href}${e.label}`)));
const G = await makeWorkspace('general', PlanCode.FREE);
const xG = await experienceOf(G.session);
check('11. Sin configurar → GENERAL (deducido, sin aplicar nada)', xG.preset.preset.key === 'general' && xG.preset.applied === false && (await prisma.workspaceProfile.findUnique({ where: { workspaceId: G.workspaceId } }))?.presetKey == null);

// =============================================================================
console.log('\n== Plan, rol y perfil ==');
const F = await makeWorkspace('free-info', PlanCode.FREE);
await setup(F.session, INFO_BODY);
const xF = await experienceOf(F.session);
const ordersF = xF.navigation.primary.find((e) => e.id === 'orders');
check('12. Modulo relevante sin plan: VISIBLE y bloqueado ("Disponible en Pro")', ordersF?.locked === true && ordersF.lockedPlan === 'Pro', `${ordersF?.lockedPlan}`);

const M = await crossTenantPrisma.user.create({ data: { name: 'Member', email: `member-${stamp}@p0e.test`, passwordHash: 'x', platformRole: PlatformRole.USER } });
createdUsers.push(M.id);
await addMembershipWithinPlan({ workspaceId: S.workspaceId, userId: M.id, role: WorkspaceRole.MEMBER });
const mInS: Session = { id: M.id, workspaceId: S.workspaceId };
const xM = await experienceOf(mInS);
const hasBilling = (x: WorkspaceExperience) => [...x.navigation.primary, ...x.navigation.system, ...x.navigation.hidden].some((e) => e.id === 'billing');
check('14. Rol independiente del plan: MEMBER en SCALE no ve Billing; el OWNER en FREE si', !hasBilling(xM) && hasBilling(xF));

await patch(mInS, { hiddenNavItems: ['activities'] });
await patch(uInS, { hiddenNavItems: ['analytics'], navOrder: ['pipeline'] });
const memberSetup = await setup(mInS, INFO_BODY);
const memberProfile = await asUser(mInS, () => profileRoute(req('/api/onboarding/profile', { businessType: 'ECOMMERCE' }, 'PATCH')));
const memberPreset = await asUser(mInS, () => presetRoute(req('/api/workspace/preset', {})));
check('16. MEMBER no puede cambiar el perfil (setup, PATCH y aplicar preset → 403)', memberSetup.status === 403 && memberProfile.status === 403 && memberPreset.status === 403);

const ownerChange = await asUser(uInS, () => profileRoute(req('/api/onboarding/profile', { businessType: 'ECOMMERCE', commerceSubtype: 'INFOPRODUCT' }, 'PATCH')));
const changed = await profileOf(S.workspaceId);
check('15. OWNER cambia el perfil (ECOMMERCE + INFOPRODUCT)', ownerChange.status === 200 && changed.businessType === 'ECOMMERCE' && changed.commerceSubtype === 'INFOPRODUCT');
xS = await experienceOf(uInS);
const prefSAfter = await getPreference({ userId: U, workspaceId: S.workspaceId });
check(
  '17. Cambiar el perfil NO toca el preset ni las preferencias',
  changed.presetKey === 'services' && xS.preset.preset.key === 'services' && xS.preset.recommendationDiffers && prefSAfter.sidebarWidth === 300 && prefSAfter.hiddenNavItems.includes('analytics'),
);
const legacy = await asUser(uInS, () => profileRoute(req('/api/onboarding/profile', { businessType: 'INFOPRODUCT' }, 'PATCH')));
const legacyProfile = await profileOf(S.workspaceId);
check('   Entrada legacy INFOPRODUCT se guarda como ECOMMERCE + INFOPRODUCT', legacy.status === 200 && legacyProfile.businessType === 'ECOMMERCE' && legacyProfile.commerceSubtype === 'INFOPRODUCT');

const applied = await asUser(uInS, () => presetRoute(req('/api/workspace/preset', {})));
const appliedProfile = await profileOf(S.workspaceId);
const uPrefApplied = await getPreference({ userId: U, workspaceId: S.workspaceId });
const mPrefApplied = await getPreference({ userId: M.id, workspaceId: S.workspaceId });
xS = await experienceOf(uInS);
check(
  '18. Aplicar el preset explicitamente actualiza defaults (el mio); las preferencias del resto no',
  applied.status === 200 && appliedProfile.presetKey === 'infoproduct' && primary(xS)[2] === 'orders' && uPrefApplied.hiddenNavItems.length === 0 && uPrefApplied.sidebarWidth === 300 && mPrefApplied.hiddenNavItems.includes('activities'),
);
// Vuelve a SERVICES para las pruebas de dashboard de servicios.
await asUser(uInS, () => profileRoute(req('/api/onboarding/profile', { businessType: 'SERVICES' }, 'PATCH')));
await asUser(uInS, () => presetRoute(req('/api/workspace/preset', {})));

// =============================================================================
console.log('\n== Dashboard por registro de widgets ==');
{
  const contact = await prisma.contact.create({ data: { workspaceId: S.workspaceId, firstName: 'Ana', lastName: 'Cliente' } });
  const stage = await prisma.pipelineStage.findFirstOrThrow({ where: { workspaceId: S.workspaceId }, orderBy: { position: 'asc' } });
  await prisma.opportunity.create({ data: { workspaceId: S.workspaceId, stageId: stage.id, title: 'Proyecto', probability: 50, value: 120000, contactId: contact.id } });
  xS = await experienceOf(uInS);
  const dS = await loadDashboard(xS, S.workspaceId);
  const valueOf = (d: typeof dS, id: string) => (d.widgets.find((w) => w.id === id)?.data as { value?: number } | null)?.value;
  check(
    '19. Widgets SERVICES (preset) con datos reales',
    JSON.stringify(dS.widgets.map((w) => w.id)) === JSON.stringify(PRESETS.services.dashboardWidgets) && valueOf(dS, 'open_opportunities') === 1 && valueOf(dS, 'pipeline_value') === 120000,
  );
  xE.preference.dashboardLayout = null;
  const dE = await loadDashboard(await experienceOf(E.session), E.workspaceId);
  check('20. Widgets ECOMMERCE', JSON.stringify(dE.widgets.map((w) => w.id)) === JSON.stringify(PRESETS.ecommerce.dashboardWidgets) && dE.widgets.every((w) => !w.locked && !w.error));

  // Ventas de hoy del infoproducto + recuperacion.
  for (const [name, total] of [['Curso A', 30000], ['Curso A', 30000], ['Guia B', 9900]] as const) {
    await prisma.customerOrder.create({
      data: { workspaceId: I.workspaceId, status: OrderStatus.CONFIRMED, subtotal: total, total, lines: { create: [{ name, unitPrice: total, quantity: 1, total }] } },
    });
  }
  await prisma.customerOrder.create({ data: { workspaceId: I.workspaceId, status: OrderStatus.CANCELLED, subtotal: 5000, total: 5000 } });
  const buyer = await prisma.contact.create({ data: { workspaceId: I.workspaceId, firstName: 'Beto', lastName: 'Comprador' } });
  const journey = await prisma.journey.create({ data: { workspaceId: I.workspaceId, key: `checkout-${stamp}`, name: 'Checkout', trigger: JourneyTrigger.CHECKOUT_ABANDONED, status: JourneyStatus.PUBLISHED } });
  await prisma.journeyEnrollment.create({
    data: { workspaceId: I.workspaceId, journeyId: journey.id, contactId: buyer.id, status: JourneyEnrollmentStatus.EXITED, exitedAt: new Date(), cancelKey: randomUUID() },
  });
  const dI = await loadDashboard(await experienceOf(uInI), I.workspaceId);
  const top = dI.widgets.find((w) => w.id === 'top_products')?.data as { rows: { label: string; value: number }[] } | null;
  check(
    '21. INFOPRODUCT: pedidos y ventas de hoy (sin cancelados), top productos y recuperados',
    valueOf(dI, 'orders_today') === 3 && valueOf(dI, 'revenue_today') === 69900 && top?.rows[0]?.label.startsWith('Curso A') === true && top.rows[0].value === 60000 && valueOf(dI, 'recovered_sales') === 1,
    `${valueOf(dI, 'orders_today')}/${valueOf(dI, 'revenue_today')}/${valueOf(dI, 'recovered_sales')}`,
  );
  const dF = await loadDashboard(xF, F.workspaceId);
  const lockedOrders = dF.widgets.find((w) => w.id === 'orders_today');
  check('22. Widget sin entitlement: bloqueado, sin datos (no se consulta)', lockedOrders?.locked === true && lockedOrders.data === null && lockedOrders.lockedPlan === 'Pro');

  const dash = (session: Session, body: unknown) => asUser(session, () => dashboardRoute(req('/api/preferences/dashboard', body)));
  const hide = await dash(uInS, { type: 'hide', id: 'pipeline_value' });
  const afterHide = await loadDashboard(await experienceOf(uInS), S.workspaceId);
  const iUntouched = await loadDashboard(await experienceOf(uInI), I.workspaceId);
  check('23. Ocultar un widget persiste (solo en este workspace)', hide.status === 200 && !afterHide.widgets.some((w) => w.id === 'pipeline_value') && afterHide.available.some((w) => w.id === 'pipeline_value') && iUntouched.fromPreset);
  const show = await dash(uInS, { type: 'show', id: 'pipeline_value' });
  const afterShow = await loadDashboard(await experienceOf(uInS), S.workspaceId);
  const badDash = await dash(uInS, { type: 'hide', id: 'pipeline_value', workspaceId: I.workspaceId });
  check('24. Restaurar un widget', show.status === 200 && afterShow.widgets.some((w) => w.id === 'pipeline_value') && badDash.status === 400);
}

// =============================================================================
console.log('\n== Checklist adaptativo ==');
{
  const cS = await getChecklist(await experienceOf(uInS), { workspaceId: S.workspaceId, role: WorkspaceRole.OWNER });
  const idsS = cS.items.map((i) => i.id);
  check('31. Checklist SERVICES: pipeline y cotizaciones, sin "crear producto"', idsS.includes('create_opportunity') && idsS.includes('setup_quotes') && !idsS.includes('create_product') && cS.items.find((i) => i.id === 'create_opportunity')?.state === 'completed');
  const cI = await getChecklist(await experienceOf(uInI), { workspaceId: I.workspaceId, role: WorkspaceRole.OWNER });
  const idsI = cI.items.map((i) => i.id);
  check('32. Checklist INFOPRODUCT: producto y recuperacion', idsI.includes('create_product') && idsI.includes('setup_recovery') && cI.items.find((i) => i.id === 'setup_recovery')?.state === 'completed');
  const cF = await getChecklist(xF, { workspaceId: F.workspaceId, role: WorkspaceRole.OWNER });
  const wa = cF.items.find((i) => i.id === 'connect_whatsapp');
  check('33. FREE: "Conecta WhatsApp" bloqueada con plan, no pendiente obligatoria', wa?.state === 'locked' && wa.lockedPlan === 'Start' && cF.actionable === cF.items.filter((i) => i.state !== 'locked').length, `${wa?.state}/${wa?.lockedPlan}`);
  const P = await makeWorkspace('pro-info', PlanCode.PRO);
  await setup(P.session, INFO_BODY);
  const cP = await getChecklist(await experienceOf(P.session), { workspaceId: P.workspaceId, role: WorkspaceRole.OWNER });
  const available = (id: string) => cP.items.find((i) => i.id === id)?.state === 'available';
  check('34. PRO commerce: producto, recuperacion y canales disponibles', available('create_product') && available('setup_recovery') && available('connect_whatsapp'));
}

// =============================================================================
console.log('\n== Tutoriales ==');
{
  const tut = (session: Session, body: unknown) => asUser(session, () => tutorialsRoute(req('/api/preferences/tutorials', body)));
  const dismissed = await tut(uInS, { dismiss: 'inbox.first_visit' });
  const uS = await getPreference({ userId: U, workspaceId: S.workspaceId });
  const uI = await getPreference({ userId: U, workspaceId: I.workspaceId });
  const mS = await getPreference({ userId: M.id, workspaceId: S.workspaceId });
  check(
    '35. Descartar un consejo solo afecta a ese usuario en ese workspace',
    dismissed.status === 200 && !shouldShowTutorial(uS, 'inbox.first_visit') && shouldShowTutorial(uI, 'inbox.first_visit') && shouldShowTutorial(mS, 'inbox.first_visit'),
  );
  const reset = await tut(uInS, { reset: true });
  const invalid = await tut(uInS, { dismiss: 'tour.gigante' });
  check('36. "Volver a mostrar consejos" funciona', reset.status === 200 && shouldShowTutorial(await getPreference({ userId: U, workspaceId: S.workspaceId }), 'inbox.first_visit') && invalid.status === 400);
}

// =============================================================================
console.log('\n== Cambio de workspace, caso interno y autoridad del plan ==');
{
  const switched = await asUserCapturingSession(uInS, () => switchRoute(req('/api/workspaces/switch', { workspaceId: I.workspaceId })));
  const xAfterSwitch = await asUser(null, async () => {
    const user = await requireCurrentUser();
    return getWorkspaceExperience({ workspaceId: user.workspace.id, userId: user.id, role: user.role });
  }, { token: switched.sessionToken });
  check(
    '38. Cambiar de workspace recalcula la experiencia (preset, nav y preferencias del otro negocio)',
    switched.result.status === 200 && xAfterSwitch.preset.preset.key === 'infoproduct' && xAfterSwitch.preference.sidebarWidth === 340 && primary(xAfterSwitch)[2] === 'orders',
  );

  const SA = await crossTenantPrisma.user.create({ data: { name: 'Super', email: `super-${stamp}@p0e.test`, passwordHash: 'x', platformRole: PlatformRole.SUPER_ADMIN } });
  createdUsers.push(SA.id);
  const internal = await createPlatformClient({
    actor: { id: SA.id, name: SA.name, email: SA.email, platformRole: SA.platformRole },
    idempotencyKey: `p0e-internal-${stamp}`,
    workspaceName: `Negocio interno infoproducto ${stamp}`,
    ownerName: '',
    ownerEmail: '',
    planCode: PlanCode.SCALE,
    billingSource: 'COMP',
    isInternal: true,
    addActorAsOwner: true,
    reason: 'smoke p0e: negocio propio',
    initialBusiness: { businessType: 'ECOMMERCE', commerceSubtype: 'INFOPRODUCT' },
  });
  createdWorkspaces.push(internal.workspaceId);
  const xInternal = await experienceOf({ id: SA.id, workspaceId: internal.workspaceId });
  const ws = await crossTenantPrisma.workspace.findUniqueOrThrow({ where: { id: internal.workspaceId }, select: { isInternal: true, subscription: { select: { billingSource: true, plan: { select: { code: true } } } } } });
  check(
    '39. Un negocio interno de infoproductos (tipo 5 Minutos con Dios) se modela sin hardcode: interno, SCALE + COMP, preset infoproduct',
    ws.isInternal && ws.subscription?.billingSource === 'COMP' && ws.subscription.plan.code === 'SCALE' && xInternal.preset.preset.key === 'infoproduct' &&
      JSON.stringify(primary(xInternal).slice(0, 9)) === JSON.stringify(['home', 'inbox', 'orders', 'products', 'contacts', 'recovery', 'automations', 'ai', 'analytics']) &&
      xInternal.navigation.primary.every((e) => !e.locked),
  );
  const notInternal = await createPlatformClient({
    actor: { id: SA.id, name: SA.name, email: SA.email, platformRole: SA.platformRole },
    idempotencyKey: `p0e-client-${stamp}`,
    workspaceName: `Cliente ${stamp}`,
    ownerName: 'Cliente',
    ownerEmail: `cliente-${stamp}@p0e.test`,
    planCode: PlanCode.FREE,
    billingSource: 'FREE',
    initialBusiness: { businessType: 'SERVICES' },
  }).then(
    (r) => (createdWorkspaces.push(r.workspaceId), false),
    () => true,
  );
  check('   Tipo de negocio inicial desde platform: solo al aprovisionar un negocio interno', notInternal);

  // El usuario "recupera" Pedidos en FREE: sigue bloqueado y el backend sigue negando.
  await patch(F.session, { navOrder: ['orders'] });
  const xF2 = await experienceOf(F.session);
  const denied = await assertFeature(F.workspaceId, 'commerce.orders').then(
    () => false,
    (error) => isEntitlementError(error),
  );
  check('40. Entitlements siguen siendo la autoridad final (preferencias no desbloquean; el backend niega)', xF2.navigation.primary[0].id === 'orders' && xF2.navigation.primary[0].locked && denied);
}

// =============================================================================
console.log('\n== Rol en el servidor (no depende del sidebar) ==');
{
  const render = async (session: Session) => {
    try {
      await asUser(session, () => BillingPage({ searchParams: Promise.resolve({}) }));
      return 'ok';
    } catch (error) {
      return String((error as { digest?: string }).digest ?? error);
    }
  };
  const memberBilling = await render(mInS);
  const ownerBilling = await render(uInS);
  check('R1. /billing: MEMBER recibe 404 aunque escriba la URL; OWNER entra', memberBilling.includes('404') && ownerBilling === 'ok', `${memberBilling} / ${ownerBilling}`);
  const memberCheckout = await asUser(mInS, () => checkoutRoute(req('/api/billing/checkout', { planCode: 'PRO' })));
  check('R2. API de checkout: MEMBER 403', memberCheckout.status === 403);

  const stage = await prisma.pipelineStage.findFirstOrThrow({ where: { workspaceId: S.workspaceId }, orderBy: { position: 'asc' } });
  const memberPatch = await asUser(mInS, () => stagePatch(req(`/api/pipeline-stages/${stage.id}`, { name: 'Hackeada' }, 'PATCH'), { params: Promise.resolve({ id: stage.id }) }));
  const memberDelete = await asUser(mInS, () => stageDelete(req(`/api/pipeline-stages/${stage.id}`, undefined, 'DELETE'), { params: Promise.resolve({ id: stage.id }) }));
  const memberCreate = await asUser(mInS, () => stageCreate(req('/api/pipeline-stages', { key: 'nuevo', name: 'X', position: 9, probability: 5 })));
  const unchanged = await prisma.pipelineStage.findUnique({ where: { id: stage.id } });
  const ownerPatch = await asUser(uInS, () => stagePatch(req(`/api/pipeline-stages/${stage.id}`, { name: 'Primer contacto' }, 'PATCH'), { params: Promise.resolve({ id: stage.id }) }));
  check(
    'R3. Configurar el pipeline: MEMBER 403 (crear, editar, borrar); OWNER 200',
    memberPatch.status === 403 && memberDelete.status === 403 && memberCreate.status === 403 && unchanged?.name === stage.name && ownerPatch.status === 200,
    `${memberPatch.status}/${memberDelete.status}/${memberCreate.status}/${ownerPatch.status}`,
  );
  const memberStillWorks = await asUser(mInS, () => createContact(req('/api/contacts', { firstName: 'Venta', lastName: 'Del miembro' })));
  check('R4. Roles comerciales intactos: MEMBER sigue creando contactos', memberStillWorks.status === 201, `${memberStillWorks.status}`);
}

// =============================================================================
console.log('\n== Onboarding pendiente + MEMBER ==');
{
  const O = await makeWorkspace('pending');
  const MO = await crossTenantPrisma.user.create({ data: { name: 'Member Pending', email: `member-pending-${stamp}@p0e.test`, passwordHash: 'x', platformRole: PlatformRole.USER } });
  createdUsers.push(MO.id);
  await addMembershipWithinPlan({ workspaceId: O.workspaceId, userId: MO.id, role: WorkspaceRole.MEMBER });
  const moSession: Session = { id: MO.id, workspaceId: O.workspaceId };

  const xMO = await experienceOf(moSession);
  const works = await asUser(moSession, () => createContact(req('/api/contacts', { firstName: 'Lead', lastName: 'Pendiente' })));
  check('O1. MEMBER entra con preset GENERAL (fallback) y trabaja normalmente', xMO.preset.preset.key === 'general' && xMO.navigation.primary.length > 0 && works.status === 201);

  const cMO = await getChecklist(xMO, { workspaceId: O.workspaceId, role: WorkspaceRole.MEMBER });
  const setupItem = cMO.items.find((item) => item.id === 'setup_profile');
  check(
    'O2. Checklist: "Configura tu negocio" es aviso sin enlace para MEMBER y no cuenta como su pendiente',
    setupItem?.roleRestricted === true && setupItem.href === null && setupItem.state === 'available' && !cMO.items.some((item) => item.href === '/bienvenida') && cMO.actionable === cMO.items.filter((i) => i.state === 'completed' || (i.state === 'available' && !i.roleRestricted)).length,
  );

  // Props del arbol devuelto por el Server Component (sin metadatos internos de React).
  const serialize = (tree: unknown) => {
    const seen = new WeakSet();
    return JSON.stringify(tree, (key, value) => {
      if (key.startsWith('_') || typeof value === 'function' || typeof value === 'symbol') return undefined;
      if (value && typeof value === 'object') {
        if (seen.has(value)) return undefined;
        seen.add(value);
      }
      return value;
    });
  };
  const memberHome = serialize(await asUser(moSession, () => DashboardPage()));
  const ownerHome = serialize(await asUser(O.session, () => DashboardPage()));
  check(
    'O3. Inicio del MEMBER: aviso de que un OWNER/ADMIN debe terminar la configuracion, SIN CTA a /bienvenida',
    memberHome.includes('Un owner o admin de este negocio puede configurarlo') && !memberHome.includes('/bienvenida') && ownerHome.includes('/bienvenida'),
  );

  const blocked = await setup(moSession, SERVICES_BODY);
  const stillPending = await prisma.workspaceProfile.findUnique({ where: { workspaceId: O.workspaceId } });
  check('O4. MEMBER no puede completar el onboarding (403) y el perfil sigue pendiente', blocked.status === 403 && !stillPending?.onboardingCompletedAt);

  const done = await setup(O.session, SERVICES_BODY);
  const xAfter = await experienceOf(moSession);
  const cAfter = await getChecklist(xAfter, { workspaceId: O.workspaceId, role: WorkspaceRole.MEMBER });
  const cOwner = await getChecklist(await experienceOf(O.session), { workspaceId: O.workspaceId, role: WorkspaceRole.OWNER });
  check(
    'O5. OWNER completa el onboarding: el MEMBER pasa al preset del negocio y la tarea queda completada',
    done.status === 200 && xAfter.preset.preset.key === 'services' && cAfter.items.find((i) => i.id === 'setup_profile')?.state === 'completed' && cOwner.items.find((i) => i.id === 'setup_profile')?.href === '/bienvenida',
  );
}

// =============================================================================
await crossTenantPrisma.platformAuditLog.deleteMany({ where: { OR: [{ targetWorkspaceId: { in: createdWorkspaces } }, { targetUserId: { in: createdUsers } }, { actorUserId: { in: createdUsers } }] } });
const memberUsers = (await prisma.workspaceMembership.findMany({ where: { workspaceId: { in: createdWorkspaces } }, select: { userId: true } })).map((m) => m.userId);
await crossTenantPrisma.workspace.deleteMany({ where: { id: { in: createdWorkspaces } } });
const cleaned = await crossTenantPrisma.user.deleteMany({ where: { id: { in: [...new Set([...createdUsers, ...memberUsers])] } } });
console.log(`\nLimpieza: ${createdWorkspaces.length} workspaces y ${cleaned.count} cuentas de prueba eliminados.`);

const passed = results.filter((result) => result.ok).length;
console.log(`\n== Resultado: ${passed}/${results.length} pruebas OK ==`);
await prisma.$disconnect();
if (failures > 0) process.exit(1);
