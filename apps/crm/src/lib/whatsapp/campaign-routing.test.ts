import assert from 'node:assert/strict';
import test from 'node:test';
import { matchCampaignRoute, parseReferral } from './campaign-routing';

const routes = [
  { id: 'camp', level: 'CAMPAIGN' as const, externalId: '300' },
  { id: 'set', level: 'ADSET' as const, externalId: '200' },
  { id: 'ad', level: 'AD' as const, externalId: '100' },
];

test('referral de anuncio: el source_id es el id del anuncio', () => {
  const a = parseReferral({ referral: { source_type: 'ad', source_id: '100', source_url: 'https://fb.me/x', ctwa_clid: 'clid' } });
  assert.equal(a?.adId, '100');
  assert.equal(a?.adSetId, null);
  assert.equal(a?.campaignId, null);
});

test('sin referral o referral de post: no hay anuncio', () => {
  assert.equal(parseReferral({ text: { body: 'hola' } }), null);
  assert.equal(parseReferral({ referral: { source_type: 'post', source_id: '9' } })?.adId, null);
});

test('prioridad anuncio > conjunto > campaña', () => {
  assert.equal(matchCampaignRoute(routes, { adId: '100', adSetId: '200', campaignId: '300' })?.id, 'ad');
  assert.equal(matchCampaignRoute(routes, { adId: '999', adSetId: '200', campaignId: '300' })?.id, 'set');
  assert.equal(matchCampaignRoute(routes, { adId: null, adSetId: null, campaignId: '300' })?.id, 'camp');
  assert.equal(matchCampaignRoute(routes, { adId: '999', adSetId: null, campaignId: null }), null);
});

test('un id de otro nivel no coincide', () => {
  assert.equal(matchCampaignRoute(routes, { adId: '300', adSetId: null, campaignId: null }), null);
});
