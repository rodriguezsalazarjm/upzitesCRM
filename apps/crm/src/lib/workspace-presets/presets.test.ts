import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { BusinessType, CommerceSubtype, WorkspaceRole } from '../../../generated/prisma/enums';
import { applyLayoutAction, presetLayout, resolveDashboard, sanitizeDashboardLayout } from '../dashboard/widgets/layout';
import { WIDGET_IDS, type WidgetId } from '../dashboard/widgets/types';
import { FEATURE_KEYS, type FeatureKey } from '../entitlements/config';
import { NAV_ITEMS } from '../navigation/items';
import { resolveNavigation, type FeatureAccess } from '../navigation/resolve';
import { SIDEBAR, clampSidebarWidth, sidebarWidthFor } from '../navigation/sidebar-layout';
import { resolveChecklist } from '../onboarding-checklist/resolve';
import { AUTOMATION_TEMPLATES } from '../automations/catalog';
import { CHECKLIST_TASK_IDS } from '../onboarding-checklist/tasks';
import { shouldShowTutorial, TUTORIAL_KEYS, TUTORIALS } from '../tutorials';
import { canonicalBusiness, normalizeBusinessInput, wizardSalesMode } from '../workspace-profile/business';
import { PRESETS, PRESET_KEYS, presetId, recommendedPresetKey, resolvePreset } from './index';

const ALL: Record<FeatureKey, FeatureAccess> = Object.fromEntries(FEATURE_KEYS.map((k) => [k, { allowed: true, requiredPlanName: null }])) as never;
const FREE: Record<FeatureKey, FeatureAccess> = Object.fromEntries(
  FEATURE_KEYS.map((k) => [k, { allowed: false, requiredPlanName: k === 'quotes' || k === 'campaigns.journeys' || k === 'channels.messaging' || k === 'ai' || k === 'agents' ? 'Start' : 'Pro' }]),
) as never;
const ids = (entries: { id: string }[]) => entries.map((e) => e.id);
const META = Object.fromEntries(
  WIDGET_IDS.map((id) => [
    id,
    {
      id,
      defaultSize: id === 'top_products' ? 'md' : 'sm',
      requiredEntitlement: ({ orders_today: 'commerce.orders', revenue_today: 'commerce.orders', top_products: 'commerce.orders', quotes_pending: 'quotes', recovered_sales: 'recovery', ai_usage: 'ai' } as Partial<Record<WidgetId, FeatureKey>>)[id],
      supportedBusinessTypes: undefined,
    },
  ]),
) as never;

// --- Presets -------------------------------------------------------------------

test('presets versionados con id estable', () => {
  for (const key of PRESET_KEYS) {
    assert.equal(PRESETS[key].key, key);
    assert.ok(Number.isInteger(PRESETS[key].version) && PRESETS[key].version >= 1);
  }
  assert.equal(presetId(PRESETS.services), 'services:v1');
});

test('los presets solo usan modulos, widgets y tareas que existen', () => {
  const navIds = new Set(NAV_ITEMS.map((i) => i.id));
  for (const preset of Object.values(PRESETS)) {
    for (const id of [...preset.navigationOrder, ...preset.defaultHiddenItems]) assert.ok(navIds.has(id), `${preset.key}: ${id}`);
    for (const id of preset.dashboardWidgets) assert.ok((WIDGET_IDS as readonly string[]).includes(id), `${preset.key}: ${id}`);
    for (const id of preset.onboardingChecklist) assert.ok((CHECKLIST_TASK_IDS as readonly string[]).includes(id), `${preset.key}: ${id}`);
  }
});

test('APPOINTMENTS no inventa Agenda (no hay modulo ni ruta)', () => {
  assert.ok(!NAV_ITEMS.some((i) => /agenda|calendar|citas/i.test(`${i.id} ${i.href} ${i.label}`)));
  assert.deepEqual(PRESETS.appointments.navigationOrder, ['home', 'inbox', 'contacts', 'automations', 'ai']);
});

test('perfil → preset recomendado; GENERAL como fallback', () => {
  assert.equal(recommendedPresetKey({ businessType: BusinessType.SERVICES }), 'services');
  assert.equal(recommendedPresetKey({ businessType: BusinessType.ECOMMERCE, commerceSubtype: CommerceSubtype.PHYSICAL_PRODUCTS }), 'ecommerce');
  assert.equal(recommendedPresetKey({ businessType: BusinessType.ECOMMERCE, commerceSubtype: CommerceSubtype.MIXED }), 'ecommerce');
  assert.equal(recommendedPresetKey({ businessType: BusinessType.ECOMMERCE, commerceSubtype: CommerceSubtype.INFOPRODUCT }), 'infoproduct');
  assert.equal(recommendedPresetKey({ businessType: BusinessType.INFOPRODUCT }), 'infoproduct', 'legacy');
  assert.equal(recommendedPresetKey({ businessType: BusinessType.APPOINTMENTS }), 'appointments');
  assert.equal(recommendedPresetKey({ businessType: BusinessType.GENERAL }), 'general');
  assert.equal(recommendedPresetKey({ businessType: BusinessType.UNDEFINED }), 'general');
  assert.equal(recommendedPresetKey(null), 'general');
});

test('el preset aplicado manda aunque cambie el perfil; se avisa la diferencia y la version nueva', () => {
  const changed = resolvePreset({ businessType: BusinessType.ECOMMERCE, commerceSubtype: CommerceSubtype.INFOPRODUCT, presetKey: 'services', presetVersion: 1 });
  assert.equal(changed.preset.key, 'services');
  assert.equal(changed.recommendationDiffers, true);
  assert.equal(changed.recommendedKey, 'infoproduct');
  const outdated = resolvePreset({ businessType: BusinessType.SERVICES, presetKey: 'services', presetVersion: 0 });
  assert.equal(outdated.updateAvailable, true);
  const unknown = resolvePreset({ businessType: BusinessType.SERVICES, presetKey: 'inventado' });
  assert.equal(unknown.preset.key, 'services');
  assert.equal(unknown.applied, false);
});

test('business: INFOPRODUCT legacy → ECOMMERCE + INFOPRODUCT; subtipo solo con ECOMMERCE', () => {
  assert.deepEqual(canonicalBusiness({ businessType: BusinessType.INFOPRODUCT }), { businessType: 'ECOMMERCE', commerceSubtype: 'INFOPRODUCT' });
  assert.deepEqual(normalizeBusinessInput({ businessType: BusinessType.INFOPRODUCT }), { businessType: 'ECOMMERCE', commerceSubtype: 'INFOPRODUCT' });
  assert.deepEqual(normalizeBusinessInput({ businessType: BusinessType.SERVICES, commerceSubtype: CommerceSubtype.MIXED }), { businessType: 'SERVICES', commerceSubtype: null });
  assert.equal(wizardSalesMode({ businessType: BusinessType.ECOMMERCE, commerceSubtype: CommerceSubtype.INFOPRODUCT }), BusinessType.INFOPRODUCT);
  assert.equal(wizardSalesMode({ businessType: BusinessType.APPOINTMENTS }), BusinessType.SERVICES);
  assert.equal(wizardSalesMode({ businessType: BusinessType.GENERAL }), BusinessType.UNDEFINED);
});

test('ningun preset ni modulo nombra un negocio concreto (sin hardcode)', () => {
  const dirs = ['src/lib/workspace-presets', 'src/lib/navigation', 'src/lib/dashboard', 'src/lib/onboarding-checklist', 'src/lib/workspace-profile'];
  for (const dir of dirs) {
    for (const file of readdirSync(join(process.cwd(), dir), { recursive: true }) as string[]) {
      if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
      const text = readFileSync(join(process.cwd(), dir, file), 'utf8');
      assert.doesNotMatch(text, /5 ?minutos|upzites\b(?!\/)/i, `${dir}/${file}`);
    }
  }
  const sidebar = readFileSync(join(process.cwd(), 'src/components/layout/sidebar.tsx'), 'utf8');
  assert.doesNotMatch(sidebar, /businessType|commerceSubtype|INFOPRODUCT|SERVICES/, 'sidebar.tsx no decide por tipo de negocio');
});

// --- Navegacion ----------------------------------------------------------------

test('SERVICES e INFOPRODUCT producen navegaciones distintas (orden del preset)', () => {
  const services = resolveNavigation({ preset: PRESETS.services, features: ALL, role: WorkspaceRole.OWNER });
  const info = resolveNavigation({ preset: PRESETS.infoproduct, features: ALL, role: WorkspaceRole.OWNER });
  assert.deepEqual(ids(services.primary).slice(0, 9), ['home', 'inbox', 'contacts', 'pipeline', 'quotes', 'activities', 'automations', 'ai', 'analytics']);
  assert.deepEqual(ids(info.primary).slice(0, 9), ['home', 'inbox', 'orders', 'products', 'contacts', 'recovery', 'automations', 'ai', 'analytics']);
  assert.ok(!ids(services.primary).includes('orders') && ids(services.hidden).includes('orders'), 'irrelevante por preset → oculto (recuperable)');
  assert.ok(!ids(info.primary).includes('pipeline'));
});

test('plan: modulo relevante no incluido → VISIBLE y bloqueado con plan', () => {
  const nav = resolveNavigation({ preset: PRESETS.infoproduct, features: FREE, role: WorkspaceRole.OWNER });
  const orders = nav.primary.find((e) => e.id === 'orders')!;
  assert.equal(orders.locked, true);
  assert.equal(orders.lockedPlan, 'Pro');
});

test('SERVICES + SCALE: Pedidos no ocupa espacio aunque el plan lo permita', () => {
  const nav = resolveNavigation({ preset: PRESETS.services, features: ALL, role: WorkspaceRole.OWNER });
  assert.ok(!ids(nav.primary).includes('orders'));
  assert.equal(nav.hidden.find((e) => e.id === 'orders')?.locked, false);
});

test('rol: independiente del plan (MEMBER no ve Billing ni con SCALE)', () => {
  const member = resolveNavigation({ preset: PRESETS.services, features: ALL, role: WorkspaceRole.MEMBER });
  const admin = resolveNavigation({ preset: PRESETS.services, features: FREE, role: WorkspaceRole.ADMIN });
  assert.ok(!ids(member.system).includes('billing') && !ids(member.hidden).includes('billing'));
  assert.ok(ids(admin.system).includes('billing'));
});

test('preferencias: ocultar, reordenar y recuperar; nunca desbloquean ni saltan el rol', () => {
  const nav = resolveNavigation({
    preset: PRESETS.services,
    features: FREE,
    role: WorkspaceRole.MEMBER,
    preference: { navOrder: ['orders', 'home', 'billing'], hiddenNavItems: ['activities', 'settings'] },
  });
  assert.equal(nav.primary[0].id, 'orders', 'recuperado desde el preset');
  assert.equal(nav.primary[0].locked, true, 'sigue bloqueado por plan');
  assert.ok(!ids(nav.primary).includes('activities') && ids(nav.hidden).includes('activities'));
  assert.ok(ids(nav.system).includes('settings'), 'sistema no se oculta');
  assert.ok(![...nav.primary, ...nav.system, ...nav.hidden].some((e) => e.id === 'billing'), 'rol filtra antes que preferencias');
});

test('GENERAL: fallback que no oculta nada', () => {
  const nav = resolveNavigation({ preset: PRESETS.general, features: ALL, role: WorkspaceRole.OWNER });
  assert.equal(nav.hidden.length, 0);
});

// --- Sidebar ----------------------------------------------------------------------

test('sidebar: 260 por defecto, 220–340, colapsado 72, movil ignora el ancho guardado', () => {
  assert.equal(sidebarWidthFor(null, { mobile: false }), 260);
  assert.equal(clampSidebarWidth(100), 220);
  assert.equal(clampSidebarWidth(900), 340);
  assert.equal(sidebarWidthFor({ sidebarWidth: 300, sidebarCollapsed: true }, { mobile: false }), 72);
  assert.equal(sidebarWidthFor({ sidebarWidth: 300 }, { mobile: false }), 300);
  assert.equal(sidebarWidthFor({ sidebarWidth: 300, sidebarCollapsed: true }, { mobile: true }), SIDEBAR.mobileWidth);
});

// --- Dashboard ------------------------------------------------------------------

test('dashboard: preset → widgets; sin plan quedan bloqueados (no se cargan)', () => {
  const info = resolveDashboard({ presetWidgets: PRESETS.infoproduct.dashboardWidgets, layout: null, defs: META, features: FREE, businessType: 'ECOMMERCE' });
  assert.deepEqual(ids(info.widgets), ['orders_today', 'revenue_today', 'top_products', 'recovered_sales', 'unread_messages', 'automation_activity']);
  assert.equal(info.widgets.find((w) => w.id === 'orders_today')?.locked, true);
  assert.equal(info.widgets.find((w) => w.id === 'unread_messages')?.locked, false);
  assert.equal(info.fromPreset, true);
});

test('dashboard: ocultar, mover, restaurar; basura del cliente se descarta', () => {
  const start = presetLayout(PRESETS.services.dashboardWidgets, META);
  const hidden = applyLayoutAction(start, { type: 'hide', id: 'pipeline_value' }, META);
  const moved = applyLayoutAction(hidden, { type: 'move', id: 'quotes_pending', direction: -1 }, META);
  const view = resolveDashboard({ presetWidgets: PRESETS.services.dashboardWidgets, layout: moved, defs: META, features: ALL, businessType: 'SERVICES' });
  assert.ok(!ids(view.widgets).includes('pipeline_value') && ids(view.available).includes('pipeline_value'));
  assert.deepEqual(ids(view.widgets).slice(0, 3), ['new_contacts', 'quotes_pending', 'open_opportunities'], 'mover salta los ocultos');
  const restored = applyLayoutAction(moved, { type: 'show', id: 'pipeline_value' }, META);
  assert.ok(ids(resolveDashboard({ presetWidgets: [], layout: restored, defs: META, features: ALL, businessType: 'SERVICES' }).widgets).includes('pipeline_value'));
  assert.deepEqual(sanitizeDashboardLayout([{ id: 'inventado' }, { id: 'ai_usage', size: 'xxl', hidden: 'si' }, { id: 'ai_usage' }]), [{ id: 'ai_usage', position: 0, size: 'sm', hidden: false }]);
});

// --- Checklist ------------------------------------------------------------------

test('checklist: derivado del preset; FREE ve lo imposible como bloqueado, no como pendiente', () => {
  const services = resolveChecklist({ presetTasks: PRESETS.services.onboardingChecklist, completed: {}, access: () => ({ allowed: true, requiredPlanName: null }), role: WorkspaceRole.OWNER });
  assert.ok(!ids(services.items).includes('create_product') && services.notRelevant.includes('create_product'));
  const info = resolveChecklist({
    presetTasks: PRESETS.infoproduct.onboardingChecklist,
    completed: { setup_profile: true },
    role: WorkspaceRole.OWNER,
    access: (req) => ('feature' in req ? FREE[req.feature] : { allowed: false, requiredPlanName: 'Start' }),
  });
  assert.ok(ids(info.items).includes('create_product'));
  const whatsapp = info.items.find((i) => i.id === 'connect_whatsapp')!;
  assert.equal(whatsapp.state, 'locked');
  assert.equal(whatsapp.lockedPlan, 'Start');
  assert.equal(info.items.find((i) => i.id === 'setup_profile')?.state, 'completed');
  assert.equal(info.actionable, info.items.filter((i) => i.state !== 'locked').length, 'lo bloqueado no cuenta como obligatorio');
});

// --- Tutoriales -------------------------------------------------------------------

test('tutoriales: se muestran hasta que la persona los descarta', () => {
  assert.equal(shouldShowTutorial(null, 'inbox.first_visit'), true);
  assert.equal(shouldShowTutorial({ dismissedTutorials: ['inbox.first_visit'] }, 'inbox.first_visit'), false);
  assert.equal(shouldShowTutorial({ dismissedTutorials: ['inbox.first_visit'] }, 'pipeline.first_visit'), true);
});

test('P14: each preset recommends real templates, has a primary action and renames only labels', () => {
  const ids = new Set(AUTOMATION_TEMPLATES.map((t) => t.id));
  for (const preset of Object.values(PRESETS)) {
    assert.ok(preset.recommendedTemplates.length > 0, preset.key);
    for (const id of preset.recommendedTemplates) assert.ok(ids.has(id), `${preset.key}: ${id}`);
    assert.match(preset.primaryAction.href, /^\//);
  }
  assert.notDeepEqual(PRESETS.services.recommendedTemplates, PRESETS.infoproduct.recommendedTemplates);
  const services = resolveNavigation({ preset: PRESETS.services, features: ALL, role: WorkspaceRole.OWNER });
  const general = resolveNavigation({ preset: PRESETS.general, features: ALL, role: WorkspaceRole.OWNER });
  const contacts = (nav: typeof services) => nav.primary.find((e) => e.id === 'contacts')!;
  assert.equal(contacts(services).label, 'Leads y clientes');
  assert.equal(contacts(general).label, 'Contactos');
  assert.equal(contacts(services).href, contacts(general).href);
});

test('P15: the menu customizer patch round-trips through resolveNavigation and reset restores the preset', () => {
  const base = resolveNavigation({ preset: PRESETS.services, features: ALL, role: WorkspaceRole.OWNER });
  const ids = base.primary.map((e) => e.id);
  // Reordenar (último primero), ocultar "activities" y recuperar "products" (oculto por el preset).
  const visible = [ids[ids.length - 1], ...ids.slice(0, -1).filter((id) => id !== 'activities'), 'products'];
  const hidden = [...base.hidden.map((e) => e.id).filter((id) => id !== 'products'), 'activities'];
  const custom = resolveNavigation({ preset: PRESETS.services, features: ALL, role: WorkspaceRole.OWNER, preference: { navOrder: visible, hiddenNavItems: hidden } });
  assert.deepEqual(custom.primary.map((e) => e.id), visible);
  assert.ok(custom.hidden.some((e) => e.id === 'activities'));
  const reset = resolveNavigation({ preset: PRESETS.services, features: ALL, role: WorkspaceRole.OWNER, preference: { navOrder: [], hiddenNavItems: [] } });
  assert.deepEqual(reset.primary.map((e) => e.id), ids);
});

test('P16: every business type walks the plan flow: profile → … → IA → automation → first result', () => {
  for (const preset of Object.values(PRESETS)) {
    const list = preset.onboardingChecklist as string[];
    const at = (id: string) => list.indexOf(id);
    const result = list.includes('first_sale') ? 'first_sale' : 'first_lead';
    assert.equal(list[0], 'setup_profile', preset.key);
    assert.ok(at('setup_ai') > 0 && at('setup_ai') < at('create_automation'), `${preset.key}: IA antes de automatización`);
    assert.ok(at(result) > at('create_automation'), `${preset.key}: primer resultado al final`);
  }
  assert.ok(PRESETS.infoproduct.onboardingChecklist.includes('first_sale'));
  assert.ok(PRESETS.services.onboardingChecklist.includes('first_lead'));
  // MEMBER: la IA es de OWNER/ADMIN → aviso sin enlace, no pendiente propio.
  const member = resolveChecklist({ presetTasks: PRESETS.services.onboardingChecklist, completed: {}, access: () => ({ allowed: true, requiredPlanName: null }), role: WorkspaceRole.MEMBER });
  const ai = member.items.find((i) => i.id === 'setup_ai')!;
  assert.equal(ai.href, null);
  assert.equal(ai.roleRestricted, true);
});

test('P17: each priority module page shows its first-visit tip, and tips stay brief', () => {
  const pages: Record<string, string> = {
    'inbox.first_visit': 'src/app/(dashboard)/inbox/page.tsx',
    'pipeline.first_visit': 'src/app/(dashboard)/oportunidades/page.tsx',
    'products.first_visit': 'src/app/(dashboard)/productos/page.tsx',
    'automation.first_visit': 'src/app/(dashboard)/automatizaciones/page.tsx',
    'ai.first_visit': 'src/app/(dashboard)/ia/agente/page.tsx',
    'recovery.first_visit': 'src/app/(dashboard)/recuperacion/page.tsx',
    'orders.first_visit': 'src/app/(dashboard)/pedidos/page.tsx',
    'social.first_visit': 'src/app/(dashboard)/social/page.tsx',
    'team.first_visit': 'src/app/(dashboard)/configuracion/equipo/page.tsx',
  };
  assert.deepEqual(Object.keys(pages).sort(), [...TUTORIAL_KEYS].sort());
  for (const [key, file] of Object.entries(pages)) {
    assert.ok(readFileSync(join(process.cwd(), file), 'utf8').includes(`tutorialKey="${key}"`), `${file} no muestra ${key}`);
    assert.ok(TUTORIALS[key as keyof typeof TUTORIALS].body.length <= 220, `${key}: consejo largo`);
  }
});

test('P18: 100% only when every possible preset step is done; a MEMBER does not see 100% while owner steps are pending', () => {
  const all = () => ({ allowed: true, requiredPlanName: null });
  const tasks = PRESETS.infoproduct.onboardingChecklist;
  const allButAi = Object.fromEntries(tasks.filter((id) => id !== 'setup_ai').map((id) => [id, true]));
  const member = resolveChecklist({ presetTasks: tasks, completed: allButAi, access: all, role: WorkspaceRole.MEMBER });
  assert.equal(member.done, false, 'falta la IA (tarea de owner/admin)');
  assert.equal(member.actionable - member.completed, 1);
  const owner = resolveChecklist({ presetTasks: tasks, completed: { ...allButAi, setup_ai: true }, access: all, role: WorkspaceRole.OWNER });
  assert.equal(owner.done, true);
  // Lo que el plan no permite no impide el 100% (no hay tareas imposibles).
  const locked = resolveChecklist({ presetTasks: tasks, completed: allButAi, access: (req) => ('feature' in req && req.feature === 'agents' ? { allowed: false, requiredPlanName: 'Start' } : all()), role: WorkspaceRole.OWNER });
  assert.equal(locked.done, true);
});
