import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PlanCode, WorkspaceRole } from '../../../generated/prisma/enums';
import { AI_CREDITS, FEATURE_KEYS, LIMIT_KEYS, PLAN_ENTITLEMENTS, PLAN_ORDER } from './config';
import { creditsFor, modelMultiplier, providerMultiplier, weightedTokens } from './credits';
import { decideByLimit, decideMemberships } from './decide';
import { flowRequirements, journeyRequirements, missingFeatures, ruleActionsOf, ruleRequirements } from './requirements';
import {
  canWith,
  legacyTermsFromValues,
  requiredPlanForFeature,
  requiredPlanForLimit,
  resolveEntitlementValues,
  valuesFromLegacyTerms,
} from './resolve';

const at = (day: number) => new Date(Date.UTC(2026, 0, day));

test('D1: catalogo aprobado, sin ilimitados', () => {
  const free = PLAN_ENTITLEMENTS.FREE;
  assert.deepEqual(
    [free.limits['users.max'], free.limits['contacts.max'], free.limits['channels.max'], free.limits['automations.active.max'], free.limits['agents.max'], free.limits['ai.monthlyCredits']],
    [1, 300, 0, 3, 0, 0],
  );
  const start = PLAN_ENTITLEMENTS.START;
  assert.deepEqual(
    [start.limits['users.max'], start.limits['contacts.max'], start.limits['channels.max'], start.limits['automations.active.max'], start.limits['agents.max'], start.limits['ai.monthlyCredits']],
    [2, 2500, 2, 10, 1, 200],
  );
  assert.equal(start.features.campaigns, 'basic');
  const pro = PLAN_ENTITLEMENTS.PRO;
  assert.deepEqual(
    [pro.limits['users.max'], pro.limits['contacts.max'], pro.limits['channels.max'], pro.limits['automations.active.max'], pro.limits['agents.max'], pro.limits['ai.monthlyCredits']],
    [5, 10000, 4, 50, 5, 1000],
  );
  assert.equal(pro.features['api.advanced'], false);
  const scale = PLAN_ENTITLEMENTS.SCALE;
  assert.deepEqual(
    [scale.limits['users.max'], scale.limits['contacts.max'], scale.limits['channels.max'], scale.limits['automations.active.max'], scale.limits['agents.max'], scale.limits['ai.monthlyCredits']],
    [15, 50000, 10, 200, 20, 4000],
  );
  for (const code of PLAN_ORDER) {
    for (const key of LIMIT_KEYS) {
      const value = PLAN_ENTITLEMENTS[code].limits[key];
      assert.ok(Number.isFinite(value) && value >= 0, `${code} ${key}`);
    }
    // Coste de Upzites sin aprobar: 0 en todos los planes.
    assert.equal(PLAN_ENTITLEMENTS[code].limits['emails.monthly'], 0);
    assert.equal(PLAN_ENTITLEMENTS[code].limits['campaignContacts.monthly'], 0);
  }
});

test('D1: funciones por plan via can()', () => {
  const can = (code: PlanCode, key: (typeof FEATURE_KEYS)[number]) => canWith(PLAN_ENTITLEMENTS[code], key);
  assert.equal(can('FREE', 'ai'), false);
  assert.equal(can('FREE', 'channels.messaging'), false);
  assert.equal(can('START', 'quotes'), true);
  assert.equal(can('START', 'commerce.orders'), false);
  assert.equal(can('START', 'integrations.shopify'), false);
  assert.equal(can('START', 'campaigns.journeys'), true);
  assert.equal(can('START', 'campaigns.bulk'), false);
  assert.equal(can('PRO', 'commerce.orders'), true);
  assert.equal(can('PRO', 'integrations.shopify'), true);
  assert.equal(can('PRO', 'recovery'), true);
  assert.equal(can('PRO', 'api.advanced'), false);
  assert.equal(can('SCALE', 'api.advanced'), true);
});

test('D6: "Disponible en X" sale del catalogo, no de un if por plan', () => {
  assert.equal(requiredPlanForFeature('commerce.orders'), 'PRO');
  assert.equal(requiredPlanForFeature('quotes'), 'START');
  assert.equal(requiredPlanForFeature('api.advanced'), 'SCALE');
  assert.equal(requiredPlanForFeature('email.promotional'), 'PRO');
  assert.equal(requiredPlanForLimit('channels.max', 3), 'PRO');
  assert.equal(requiredPlanForLimit('contacts.max', 301), 'START');
  assert.equal(requiredPlanForLimit('users.max', 16), null);
});

test('resolucion: SUSPENDED todo en cero, EXPIRED = FREE, GRACE conserva el plan', () => {
  const suspended = resolveEntitlementValues({ hasAccess: false, effectivePlan: 'PRO' }, null);
  assert.equal(suspended.source, 'SUSPENDED');
  assert.ok(LIMIT_KEYS.every((key) => suspended.values.limits[key] === 0));
  assert.ok(FEATURE_KEYS.every((key) => !canWith(suspended.values, key)));
  assert.equal(resolveEntitlementValues({ hasAccess: true, effectivePlan: 'FREE' }, null).planCode, 'FREE');
  assert.equal(resolveEntitlementValues({ hasAccess: true, effectivePlan: 'PRO' }, null).values, PLAN_ENTITLEMENTS.PRO);
  // LEGACY sin terminos cae a FREE (nunca regala).
  assert.equal(resolveEntitlementValues({ hasAccess: true, effectivePlan: 'LEGACY' }, null).planCode, 'FREE');
});

test('legacy: capacidades de la beta se traducen, lo no limitado toma el techo de SCALE', () => {
  const values = valuesFromLegacyTerms({
    key: 'monthly',
    name: 'Mensual',
    priceClp: 0,
    capabilities: ['WHATSAPP', 'AI_AGENTS', 'PAYMENTS', 'QUOTES'],
    allowances: { users: 3, contacts: 1000, emails: 2000 },
    overages: {},
  });
  assert.equal(values.limits['users.max'], 3);
  assert.equal(values.limits['contacts.max'], 1000);
  assert.equal(values.limits['channels.max'], PLAN_ENTITLEMENTS.SCALE.limits['channels.max']);
  assert.equal(values.features.commerce, true);
  assert.equal(values.features.shopify, false);
  assert.equal(values.features.campaigns, false);
});

test('compatibilidad: terminos legacy derivados del catalogo, sin overage', () => {
  const pro = legacyTermsFromValues(PLAN_ENTITLEMENTS.PRO);
  assert.ok(pro.capabilities.includes('QUOTES') && pro.capabilities.includes('EMAIL') && pro.capabilities.includes('PAYMENTS'));
  assert.equal(pro.allowances.whatsapp_numbers, 4);
  assert.equal(pro.allowances.ai_credits, 1000);
  assert.equal(pro.allowances.ai_cost_clp, undefined);
  assert.deepEqual(pro.overages, {});
  const free = legacyTermsFromValues(PLAN_ENTITLEMENTS.FREE);
  assert.deepEqual(free.capabilities, []);
  assert.equal(free.allowances.contacts, 300);
});

test('D2: FREE solo publica automatizaciones internas', () => {
  const internal = { nodes: [{ id: 'a', type: 'ACTION', action: 'ADD_TAG' }, { id: 'b', type: 'CONDITION' }, { id: 'c', type: 'DELAY' }, { id: 'd', type: 'HUMAN_HANDOFF' }] };
  assert.deepEqual(flowRequirements(internal), []);
  const withAi = { nodes: [{ id: 'ai-1', type: 'AI' }] };
  assert.deepEqual(missingFeatures(PLAN_ENTITLEMENTS.FREE, flowRequirements(withAi)).map((m) => m.feature), ['ai', 'agents']);
  const withMessage = { nodes: [{ id: 'msg', type: 'MESSAGE' }] };
  assert.deepEqual(missingFeatures(PLAN_ENTITLEMENTS.FREE, flowRequirements(withMessage)).map((m) => m.feature), ['channels.messaging']);
  assert.deepEqual(missingFeatures(PLAN_ENTITLEMENTS.START, flowRequirements(withMessage)), []);
  const checkout = { nodes: [{ id: 'pay', type: 'ACTION', action: 'CREATE_CHECKOUT' }] };
  assert.deepEqual(missingFeatures(PLAN_ENTITLEMENTS.START, flowRequirements(checkout)).map((m) => m.feature), ['commerce.checkout']);
  assert.deepEqual(missingFeatures(PLAN_ENTITLEMENTS.PRO, flowRequirements(checkout)), []);
});

test('D2: reglas y journeys', () => {
  assert.deepEqual(ruleRequirements([{ type: 'ADD_TAG' }, { type: 'CREATE_TASK' }, { type: 'SCHEDULE_ACTION', actionType: 'FOLLOW_UP' }]), []);
  assert.deepEqual(ruleRequirements([{ type: 'SEND_MESSAGE' }]).map((r) => r.feature), ['channels.messaging']);
  assert.deepEqual(ruleRequirements([{ type: 'RUN_AGENT' }]).map((r) => r.feature), ['ai', 'agents']);
  assert.deepEqual(ruleActionsOf({ actions: null, action: 'SEND_MESSAGE' }), [{ type: 'SEND_MESSAGE' }]);
  const recovery = journeyRequirements({ trigger: 'CHECKOUT_ABANDONED', steps: [{ action: 'SEND_WHATSAPP' }] });
  assert.deepEqual(missingFeatures(PLAN_ENTITLEMENTS.START, recovery).map((m) => m.feature), ['recovery']);
  assert.deepEqual(missingFeatures(PLAN_ENTITLEMENTS.FREE, recovery).map((m) => m.feature), ['campaigns.journeys', 'recovery', 'channels.messaging']);
});

test('D4: se conservan los mas antiguos, determinista', () => {
  const items = [
    { id: 'b', createdAt: at(1) },
    { id: 'a', createdAt: at(1) },
    { id: 'c', createdAt: at(2) },
  ].sort((x, y) => x.createdAt.getTime() - y.createdAt.getTime() || (x.id < y.id ? -1 : 1));
  const decision = decideByLimit(items, 2, 'channels.max');
  assert.deepEqual(decision.allowed, ['a', 'b']);
  assert.deepEqual(decision.limited, [{ id: 'c', reason: 'channels.max' }]);
  // Un bloqueado por funcion no ocupa cupo.
  const withBlocked = decideByLimit(items, 2, 'automations.active.max', new Map([['a', 'feature:ai']]));
  assert.deepEqual(withBlocked.allowed, ['b', 'c']);
  assert.deepEqual(withBlocked.limited, [{ id: 'a', reason: 'feature:ai' }]);
});

test('D4: memberships OWNER > ADMIN > MEMBER y nunca sin OWNER', () => {
  const members = [
    { id: 'm1', role: WorkspaceRole.MEMBER, createdAt: at(1) },
    { id: 'a1', role: WorkspaceRole.ADMIN, createdAt: at(2) },
    { id: 'o1', role: WorkspaceRole.OWNER, createdAt: at(3) },
  ];
  assert.deepEqual(decideMemberships(members, 1).allowed, ['o1']);
  assert.deepEqual(decideMemberships(members, 2).allowed, ['o1', 'a1']);
  // Aun con limite 0, el OWNER queda habilitado.
  assert.deepEqual(decideMemberships(members, 0).allowed, ['o1']);
});

test('creditos IA: ceil((input + output*4) * mult / 1000)', () => {
  assert.equal(AI_CREDITS.outputWeight, 4);
  assert.equal(AI_CREDITS.tokensPerCredit, 1000);
  // 1000 ponderados → 1 credito; 1001 → 2 (redondeo hacia arriba por inferencia).
  assert.equal(creditsFor({ inputTokens: 1000, outputTokens: 0 }), 1);
  assert.equal(creditsFor({ inputTokens: 1001, outputTokens: 0 }), 2);
  // El output pesa 4: 250 de salida = 1000 ponderados = 1 credito.
  assert.equal(weightedTokens({ inputTokens: 0, outputTokens: 250 }), 1000);
  assert.equal(creditsFor({ inputTokens: 0, outputTokens: 250 }), 1);
  assert.equal(creditsFor({ inputTokens: 600, outputTokens: 100 }), 1);
  assert.equal(creditsFor({ inputTokens: 600, outputTokens: 101 }), 2);
  // Multiplicadores = 1 por defecto (proveedor/modelo sin configurar).
  assert.equal(providerMultiplier('openai'), 1);
  assert.equal(modelMultiplier('gpt-5-mini'), 1);
  assert.equal(providerMultiplier(undefined) * modelMultiplier(undefined), 1);
  assert.equal(creditsFor({ inputTokens: 1000, outputTokens: 0, provider: 'openai', model: 'gpt-5-mini' }), 1);
  // Sin consumo, sin creditos.
  assert.equal(creditsFor({ inputTokens: 0, outputTokens: 0 }), 0);
});

test('ningun consumidor pregunta por el nombre del plan', () => {
  // D1/API: prohibido `plan === 'PRO'` y similares fuera del catalogo.
  const root = join(process.cwd(), 'src');
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts')) {
        const text = readFileSync(path, 'utf8');
        if (/(plan|planCode|effectivePlan|configuredPlan)\s*[!=]==\s*['"](START|PRO|SCALE)['"]/.test(text)) offenders.push(path);
        if (/(===|!==)\s*PlanCode\.(START|PRO|SCALE)\b/.test(text)) offenders.push(path);
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, []);
});
