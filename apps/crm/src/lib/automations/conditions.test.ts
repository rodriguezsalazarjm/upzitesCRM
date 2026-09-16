import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateCondition, type ConditionContext, type ConditionNode } from './conditions';

const baseContext: ConditionContext = {
  tags: ['lead_magnet_guia'],
  customFields: { presupuesto: '5000' },
  channel: 'INSTAGRAM',
  pipelineStage: 'Nuevo',
  leadStatus: 'LEAD',
  purchasedProductIds: ['prod-1'],
};

test('TAG EXISTS: verdadero si el tag esta presente', () => {
  const node: ConditionNode = { id: 'c1', type: 'CONDITION', field: 'TAG', operator: 'EXISTS', value: 'lead_magnet_guia' };
  assert.equal(evaluateCondition(node, baseContext), true);
});

test('TAG NOT_EXISTS: verdadero si el tag NO esta', () => {
  const node: ConditionNode = { id: 'c1', type: 'CONDITION', field: 'TAG', operator: 'NOT_EXISTS', value: 'otro_tag' };
  assert.equal(evaluateCondition(node, baseContext), true);
});

test('CHANNEL EQUALS/NOT_EQUALS', () => {
  const equals: ConditionNode = { id: 'c1', type: 'CONDITION', field: 'CHANNEL', operator: 'EQUALS', value: 'INSTAGRAM' };
  const notEquals: ConditionNode = { id: 'c2', type: 'CONDITION', field: 'CHANNEL', operator: 'NOT_EQUALS', value: 'WHATSAPP' };
  assert.equal(evaluateCondition(equals, baseContext), true);
  assert.equal(evaluateCondition(notEquals, baseContext), true);
});

test('PRODUCT_PURCHASED', () => {
  const has: ConditionNode = { id: 'c1', type: 'CONDITION', field: 'PRODUCT_PURCHASED', operator: 'EXISTS', value: 'prod-1' };
  const missing: ConditionNode = { id: 'c2', type: 'CONDITION', field: 'PRODUCT_PURCHASED', operator: 'EXISTS', value: 'prod-2' };
  assert.equal(evaluateCondition(has, baseContext), true);
  assert.equal(evaluateCondition(missing, baseContext), false);
});

test('CUSTOM_FIELD EXISTS/NOT_EXISTS', () => {
  const exists: ConditionNode = { id: 'c1', type: 'CONDITION', field: 'CUSTOM_FIELD', operator: 'EXISTS', value: 'presupuesto' };
  const notExists: ConditionNode = { id: 'c2', type: 'CONDITION', field: 'CUSTOM_FIELD', operator: 'NOT_EXISTS', value: 'inexistente' };
  assert.equal(evaluateCondition(exists, baseContext), true);
  assert.equal(evaluateCondition(notExists, baseContext), true);
});

test('PIPELINE_STAGE y LEAD_STATUS', () => {
  const stage: ConditionNode = { id: 'c1', type: 'CONDITION', field: 'PIPELINE_STAGE', operator: 'EQUALS', value: 'Nuevo' };
  const status: ConditionNode = { id: 'c2', type: 'CONDITION', field: 'LEAD_STATUS', operator: 'NOT_EQUALS', value: 'CUSTOMER' };
  assert.equal(evaluateCondition(stage, baseContext), true);
  assert.equal(evaluateCondition(status, baseContext), true);
});
