import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flowGraphSchema, validateFlowGraph, type FlowGraph } from './schema';
import { AUTOMATION_TEMPLATES, generateQuickFlow, missingCapabilities } from './catalog';
import { evaluateCondition } from './conditions';

test('serialization preserves positions, branches, selected account and configuration', () => {
  const graph = generateQuickFlow({ kind: 'comment', accountId: 'a', keyword: 'GUIA', match: 'EXACT', postId: 'reel', publicReply: 'Listo', text: 'Aquí', tag: 'guia', followup: '¿Dudas?' });
  const roundtrip = flowGraphSchema.parse(JSON.parse(JSON.stringify(graph)));
  assert.deepEqual(roundtrip, graph);
  assert.equal(validateFlowGraph(roundtrip).valid, true);
  assert.equal(roundtrip.nodes[0].type, 'MESSAGE');
  assert.equal(roundtrip.nodes.filter(n => n.type === 'MESSAGE').length, 3);
});
test('validation rejects disconnected islands, cycles and incomplete condition branches', () => {
  const graph: FlowGraph = { trigger: { type: 'MESSAGE_RECEIVED' }, nodes: [{ id: 'a', type: 'MESSAGE', text: 'a' }, { id: 'b', type: 'END' }], edges: [] };
  assert.equal(validateFlowGraph(graph).valid, false);
  graph.edges = [{ id: 'ab', from: 'a', to: 'b' }, { id: 'ba', from: 'b', to: 'a' }];
  assert.equal(validateFlowGraph(graph).valid, false);
  graph.nodes[0] = { id: 'a', type: 'CONDITION', field: 'TAG', operator: 'EXISTS', value: 'x' };
  graph.edges = [{ id: 'ab', from: 'a', to: 'b', branch: 'true' }];
  assert.equal(validateFlowGraph(graph).valid, false);
});
test('templates generate independent graphs and keep prepared capabilities blocked', () => {
  assert.ok(AUTOMATION_TEMPLATES.length >= 12);
  const template = AUTOMATION_TEMPLATES[0];
  const first = generateQuickFlow(template.config), second = generateQuickFlow(template.config);
  first.nodes[0].id = 'edited';
  assert.notEqual(first.nodes[0].id, second.nodes[0].id);
  assert.notEqual(first.nodes[0].id, template.graph.nodes[0].id);
  assert.deepEqual(missingCapabilities({ id: 'ig', channel: 'INSTAGRAM', status: 'CONNECTED', capabilities: [], displayName: 'IG' }, ['FOLLOW_TRIGGER']), ['FOLLOW_TRIGGER']);
  assert.deepEqual(missingCapabilities({ id: 'tt', channel: 'TIKTOK', status: 'CONNECTED', capabilities: [], displayName: 'TT' }, ['RECEIVE_DM']), ['RECEIVE_DM']);
});
test('custom field condition compares a separate key and value', () => {
  assert.equal(evaluateCondition({ id: 'c', type: 'CONDITION', field: 'CUSTOM_FIELD', fieldKey: 'need', operator: 'EQUALS', value: 'curso' }, { tags: [], customFields: { need: 'curso' }, channel: null, pipelineStage: null, leadStatus: null, purchasedProductIds: [] }), true);
});
