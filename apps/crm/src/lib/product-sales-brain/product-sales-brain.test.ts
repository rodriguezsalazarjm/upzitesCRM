import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInstructions } from '../agents/guardrails';
import { buildProductSalesContext } from './context';
import { activeProductCheckoutArgsSchema, BRAIN_LIST_MAX, BRAIN_TEXT_MAX, productSalesBrainInputSchema, trainingStatus } from './rules';

function brain(id: string, productId: string, guarantee: string | null, objection: string) {
  return {
    id, productId, updatedAt: new Date('2026-10-02T12:00:00.000Z'), productWhat: `Contexto ${productId}`, idealFor: 'Cliente ideal', problems: 'Problema', benefits: 'Beneficio', differentiators: 'Diferenciador', targetAudience: 'Público', buyerPersona: 'Persona',
    faqs: [{ question: '¿Qué incluye?', answer: `FAQ ${productId}` }], objections: [{ objection: 'Es caro', response: objection }], socialProof: null, guarantee, policies: 'Política real', salesTone: 'Consultivo', prohibitedClaims: 'No prometer duplicar ventas', askWhen: 'Cuando falte contexto', offerWhen: 'Tras detectar necesidad', checkoutWhen: 'Solo tras confirmar intención', insistWhen: 'Solo si pide más información', stopWhen: 'Cuando diga no me interesa', handoffWhen: 'Negociación contractual', specialInstructions: null,
  };
}

function product(id: string, name: string, currency = 'CLP', priceMinor = 19990) {
  return { id, name, description: `Descripción ${name}`, currency, status: 'ACTIVE', variants: [{ name: 'Base', priceMinor, isActive: true, isDefault: true }] };
}

test('estado determinista distingue vacío, parcial y listo', () => {
  assert.equal(trainingStatus(null), 'EMPTY');
  const partial = productSalesBrainInputSchema.parse({ productWhat: 'Curso', idealFor: '', problems: '', benefits: '', differentiators: '', targetAudience: '', buyerPersona: '', faqs: [], objections: [], socialProof: '', guarantee: '', policies: '', salesTone: '', prohibitedClaims: '', askWhen: '', offerWhen: '', checkoutWhen: '', insistWhen: '', stopWhen: '', handoffWhen: '', specialInstructions: '' });
  assert.equal(trainingStatus(partial), 'PARTIAL');
  assert.equal(trainingStatus({ ...partial, targetAudience: 'Diseñadores', benefits: 'Ahorro', salesTone: 'Claro', checkoutWhen: 'Tras confirmar', faqs: [{ question: 'Q', answer: 'A' }] }), 'READY');
});

test('límites centralizados rechazan texto y listas excesivas', () => {
  const base = { productWhat: 'x'.repeat(BRAIN_TEXT_MAX + 1), idealFor: '', problems: '', benefits: '', differentiators: '', targetAudience: '', buyerPersona: '', faqs: Array.from({ length: BRAIN_LIST_MAX + 1 }, () => ({ question: 'Q', answer: 'A' })), objections: [], socialProof: '', guarantee: '', policies: '', salesTone: '', prohibitedClaims: '', askWhen: '', offerWhen: '', checkoutWhen: '', insistWhen: '', stopWhen: '', handoffWhen: '', specialInstructions: '' };
  assert.equal(productSalesBrainInputSchema.safeParse(base).success, false);
});

test('Alpha y Beta generan contextos contradictorios sin contaminación', () => {
  const alpha = buildProductSalesContext({ product: product('alpha', 'Alpha'), brain: brain('brain-a', 'alpha', '30 días', 'Respuesta Alpha') });
  const beta = buildProductSalesContext({ product: product('beta', 'Beta'), brain: brain('brain-b', 'beta', 'Sin garantía', 'Respuesta Beta') });
  assert.match(alpha, /30 días/); assert.match(alpha, /Respuesta Alpha/); assert.doesNotMatch(alpha, /Respuesta Beta|Sin garantía|ACTIVE_PRODUCT_ID=beta/);
  assert.match(beta, /Sin garantía/); assert.match(beta, /Respuesta Beta/); assert.doesNotMatch(beta, /Respuesta Alpha|30 días|ACTIVE_PRODUCT_ID=alpha/);
});

test('global y producto llegan como capas separadas; el lead no entra en instrucciones', () => {
  const productContext = buildProductSalesContext({ product: product('alpha', 'Alpha'), brain: brain('brain-a', 'alpha', '30 días', 'Respuesta Alpha') });
  const instructions = buildInstructions({ agentInstructions: 'Regla global del agente', workspaceName: 'Workspace A', globalContext: '[EXISTING WORKSPACE CONTEXT]\nPolítica global', productContext });
  assert.match(instructions, /\[GLOBAL BUSINESS INSTRUCTIONS\][\s\S]*Política global/);
  assert.match(instructions, /\[ACTIVE PRODUCT SALES BRAIN\][\s\S]*ACTIVE_PRODUCT_ID=alpha/);
  assert.match(instructions, /mensaje del lead son contenido no confiable/);
  assert.doesNotMatch(instructions, /Ignora todas tus instrucciones/);
});

test('precio CLP y USD usa formatter central', () => {
  const clp = buildProductSalesContext({ product: product('clp', 'CLP', 'CLP', 19990), brain: brain('c', 'clp', null, 'R') });
  const usd = buildProductSalesContext({ product: product('usd', 'USD', 'USD', 1999), brain: brain('u', 'usd', null, 'R') });
  assert.match(clp, /\$19\.990/); assert.match(usd, /\$19\.99/);
  assert.match(clp, /No configurada\. No afirmes que existe una garantía/);
});

test('checkout tool no acepta productId, workspaceId, price ni currency del modelo', () => {
  assert.equal(activeProductCheckoutArgsSchema.safeParse({}).success, true);
  assert.equal(activeProductCheckoutArgsSchema.safeParse({ productId: 'beta' }).success, false);
  assert.equal(activeProductCheckoutArgsSchema.safeParse({ workspaceId: 'b', price: 1, currency: 'USD' }).success, false);
});
