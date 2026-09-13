import assert from 'node:assert/strict';
import { scoreOffer, selectTopCandidates } from '../src/lib/growth/dealScoring';
import { ShopeeProductOffer } from '../src/lib/shopee/types';

const offer: ShopeeProductOffer = {
  itemId: '123', shopId: '456', productName: 'Fixture', shopName: 'Fixture',
  priceMin: '50', priceMax: '50', commissionRate: '0.20', commission: '10',
  sales: 5000, ratingStar: '5', priceDiscountRate: 50, shopType: 1,
  imageUrl: '', productLink: '', offerLink: '',
};
assert.equal(scoreOffer(offer).score.comissao, 5);
assert.ok(Math.abs(scoreOffer({ ...offer, commissionRate: '0.07' }).score.comissao - 1.75) < 1e-12);
assert.equal(scoreOffer(offer).score.confiancaHistorico, 0);
const lowScore = { ...offer, itemId: 'low', priceDiscountRate: 15, ratingStar: '4.5', sales: 50 };
assert.equal(scoreOffer(lowScore).passesHardCuts, true);
assert.equal(selectTopCandidates([lowScore]).length, 0);
assert.equal(selectTopCandidates([{ ...offer, ratingStar: '4.4' }]).length, 0);
const selected = selectTopCandidates([lowScore, offer, { ...offer, itemId: 'second', priceDiscountRate: 45 }], 1);
assert.deepEqual(selected.map(c => c.offer.itemId), ['123']);
console.log('OK: comissão fracionária, histórico zerado, cortes, score mínimo e limite.');
