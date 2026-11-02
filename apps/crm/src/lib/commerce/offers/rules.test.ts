import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_OFFERS_PER_KIND,
  defaultOfferHeadline,
  effectiveOfferPrice,
  formatRate,
  offerCreateSchema,
  offerReorderSchema,
  offerUpdateSchema,
  pickOffer,
  summarizeOfferStats,
  upsellDecisionSchema,
  type OfferStatRow,
} from './rules';
import type { BumpCandidate } from '../product-studio/rules';

const valid = { kind: 'ORDER_BUMP', variantId: 'v1', headline: 'Agregar también 7 audios', description: ' Para escuchar en el auto ', price: null, showImage: true, isActive: true };

test('schema de creacion: whitelist estricta y montos enteros', () => {
  const parsed = offerCreateSchema.parse(valid);
  assert.equal(parsed.description, 'Para escuchar en el auto');
  assert.equal(offerCreateSchema.parse({ ...valid, description: '   ' }).description, null);
  assert.equal(offerCreateSchema.safeParse({ ...valid, workspaceId: 'otro' }).success, false, 'el workspace sale de la sesion');
  assert.equal(offerCreateSchema.safeParse({ ...valid, priority: 0 }).success, false, 'la prioridad solo se cambia reordenando');
  assert.equal(offerCreateSchema.safeParse({ ...valid, productId: 'x' }).success, false);
  assert.equal(offerCreateSchema.safeParse({ ...valid, kind: 'DOWNSELL' }).success, false);
  assert.equal(offerCreateSchema.safeParse({ ...valid, price: 0 }).success, false, 'precio especial > 0');
  assert.equal(offerCreateSchema.safeParse({ ...valid, price: 10.5 }).success, false, 'unidades menores enteras');
  assert.equal(offerCreateSchema.safeParse({ ...valid, price: -1 }).success, false);
  assert.equal(offerCreateSchema.safeParse({ ...valid, headline: '  ' }).success, false);
  assert.equal(offerCreateSchema.safeParse({ ...valid, headline: 'x'.repeat(121) }).success, false);
  assert.equal(offerCreateSchema.safeParse({ ...valid, description: 'x'.repeat(401) }).success, false);
  assert.equal(offerCreateSchema.safeParse({ ...valid, variantId: "v1' OR 1=1" }).success, false);
  assert.equal(offerCreateSchema.parse({ ...valid, price: 2990 }).price, 2990);
});

test('schema de edicion: el tipo no cambia', () => {
  const rest = { variantId: valid.variantId, headline: valid.headline, description: valid.description, price: valid.price, showImage: valid.showImage, isActive: valid.isActive };
  assert.ok(offerUpdateSchema.safeParse(rest).success);
  assert.equal(offerUpdateSchema.safeParse(valid).success, false);
});

test('reordenar: ids unicos y acotados', () => {
  assert.ok(offerReorderSchema.safeParse({ kind: 'UPSELL', ids: ['a', 'b'] }).success);
  assert.equal(offerReorderSchema.safeParse({ kind: 'UPSELL', ids: ['a', 'a'] }).success, false);
  assert.equal(offerReorderSchema.safeParse({ kind: 'UPSELL', ids: [] }).success, false);
  assert.equal(offerReorderSchema.safeParse({ kind: 'UPSELL', ids: Array.from({ length: MAX_OFFERS_PER_KIND + 1 }, (_, i) => `o${i}`) }).success, false);
});

test('decision del upsell: solo aceptar o rechazar', () => {
  assert.ok(upsellDecisionSchema.safeParse('accept').success);
  assert.ok(upsellDecisionSchema.safeParse('decline').success);
  assert.equal(upsellDecisionSchema.safeParse('accept-and-charge-twice').success, false);
  assert.equal(upsellDecisionSchema.safeParse(null).success, false);
});

test('precio efectivo y titulo sugerido', () => {
  assert.equal(effectiveOfferPrice(null, 5990), 5990);
  assert.equal(effectiveOfferPrice(2990, 5990), 2990);
  assert.equal(effectiveOfferPrice(0, 5990), 5990);
  assert.equal(defaultOfferHeadline('ORDER_BUMP', '7 audios'), 'Agregar también 7 audios');
  assert.ok(defaultOfferHeadline('UPSELL', 'x'.repeat(200)).length <= 120);
});

const candidate = (patch: Partial<BumpCandidate> = {}): BumpCandidate => ({ productId: 'p2', workspaceId: 'A', status: 'ACTIVE', currency: 'CLP', variantActive: true, price: 2990, ...patch });
const offer = (id: string, priority: number, patch: { isActive?: boolean; archivedAt?: Date | null } = {}) => ({ id, priority, isActive: true, archivedAt: null, ...patch });
const context = { mainProductId: 'p1', workspaceId: 'A', currency: 'CLP' };

test('prioridad: gana la primera disponible; las demas son respaldo', () => {
  const list = [
    { offer: offer('tercera', 2), candidate: candidate() },
    { offer: offer('primera', 0), candidate: candidate() },
    { offer: offer('segunda', 1), candidate: candidate() },
  ];
  assert.equal(pickOffer(list, context)?.offer.id, 'primera');
  list[1].candidate = candidate({ status: 'DRAFT' });
  assert.equal(pickOffer(list, context)?.offer.id, 'segunda', 'la de prioridad 0 en borrador cede el lugar');
  list[2].offer = offer('segunda', 1, { isActive: false });
  assert.equal(pickOffer(list, context)?.offer.id, 'tercera', 'pausada no compite');
  list[0].offer = offer('tercera', 2, { archivedAt: new Date() });
  assert.equal(pickOffer(list, context), null, 'archivada no compite');
});

test('prioridad: nunca otro workspace, otra moneda, el mismo producto o sin precio', () => {
  for (const bad of [candidate({ workspaceId: 'B' }), candidate({ currency: 'USD' }), candidate({ productId: 'p1' }), candidate({ price: 0 }), candidate({ variantActive: false }), candidate({ status: 'ARCHIVED' }), null]) {
    assert.equal(pickOffer([{ offer: offer('x', 0), candidate: bad }], context), null);
  }
});

const row = (patch: Partial<OfferStatRow>): OfferStatRow => ({ status: 'SHOWN', priceMinor: 2990, paid: false, basePaid: false, simulated: false, ...patch });

test('medicion del bump: take rate sobre pedidos PAGADOS en que se mostro', () => {
  const stats = summarizeOfferStats('ORDER_BUMP', [
    row({ status: 'ACCEPTED', paid: true, basePaid: true }),
    row({ status: 'DECLINED', basePaid: true }),
    row({ status: 'DECLINED', basePaid: true }),
    row({ status: 'SHOWN' }), // checkout abandonado: no cuenta en la base
    row({ status: 'ACCEPTED' }), // acepto pero no pago: no es venta
  ]);
  assert.equal(stats.shown, 5);
  assert.equal(stats.accepted, 2);
  assert.equal(stats.declined, 2);
  assert.equal(stats.paid, 1);
  assert.equal(stats.revenue, 2990);
  assert.equal(stats.takeRate, 1 / 3);
  assert.equal(formatRate(stats.takeRate), '33.3%');
});

test('medicion del upsell: take rate = pagos adicionales / veces mostrada', () => {
  const stats = summarizeOfferStats('UPSELL', [
    row({ status: 'ACCEPTED', paid: true, priceMinor: 9990, simulated: true }),
    row({ status: 'ACCEPTED', paid: false, priceMinor: 9990 }),
    row({ status: 'DECLINED' }),
    row({ status: 'SHOWN' }),
  ]);
  assert.equal(stats.takeRate, 0.25);
  assert.equal(stats.revenue, 9990);
  assert.equal(stats.simulated, 1);
  assert.equal(summarizeOfferStats('UPSELL', []).takeRate, null);
  assert.equal(formatRate(null), '—');
});
