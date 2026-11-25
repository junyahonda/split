import test from 'node:test';
import assert from 'node:assert/strict';
import { moneyInput, percentage, allocate, calculate, validDraft } from './split.mjs';

const base = () => ({ version: 1, title: 'Dinner', currency: 'USD', people: [{ id: 'a', name: 'Alex' }, { id: 'b', name: 'Bea' }, { id: 'c', name: 'Cam' }], items: [], tax: '5.00', tip: '20', tipMode: 'percent' });

test('parses money exactly and rejects invalid, negative, and overprecision inputs', () => {
  assert.equal(moneyInput('19.99'), 1999);
  assert.equal(moneyInput('0.1'), 10);
  assert.equal(moneyInput('12.'), 1200);
  for (const value of ['-1', 'NaN', '1e2', '1.001', '', '12,50', '10000000']) assert.equal(moneyInput(value), null);
  assert.equal(percentage('18.25'), 1825);
  assert.equal(percentage('100.01'), null);
});

test('allocates tax and pre-tax tip in proportion to food, including shared items', () => {
  const bill = base();
  bill.items = [{ name: 'Pizza', cents: 2400, people: ['a'] }, { name: 'Pasta', cents: 1800, people: ['b'] }, { name: 'Salad', cents: 1200, people: ['c'] }, { name: 'Fries', cents: 900, people: ['a', 'b', 'c'] }];
  bill.tax = '6.30';
  const result = calculate(bill);
  assert.equal(result.subtotal, 6300);
  assert.equal(result.tip, 1260);
  assert.equal(result.total, 8190);
  assert.deepEqual(result.shares.map((p) => p.total), [3510, 2730, 1950]);
  assert.deepEqual(result.shares.map((p) => p.tax), [270, 210, 150]);
});

test('shared penny, tax, and custom tip conserve every cent', () => {
  const bill = base(); bill.items = [{ name: 'Shared plate', cents: 1000, people: ['a', 'b', 'c'] }];
  bill.tax = '0.01'; bill.tip = '0.02'; bill.tipMode = 'amount';
  const result = calculate(bill);
  assert.equal(result.total, 1003);
  assert.equal(result.shares.reduce((sum, p) => sum + p.total, 0), result.total);
  assert.deepEqual(result.shares.map((p) => p.subtotal), [334, 333, 333]);
  for (const p of result.shares) assert.equal(p.subtotal, p.items.reduce((sum, i) => sum + i.cents, 0));
});

test('an unassigned person owes zero; an unassigned item blocks calculation', () => {
  const bill = base(); bill.items = [{ name: 'Meal', cents: 1500, people: ['b'] }];
  const result = calculate(bill);
  assert.equal(result.shares[0].total, 0);
  assert.equal(result.shares[2].total, 0);
  bill.items[0].people = [];
  assert.throws(() => calculate(bill), /Assign every item/);
});

test('tax uses exact shared weights rather than rounded food cents', () => {
  const bill = base(); bill.items = [{ name: 'Shared', cents: 1, people: ['a', 'b', 'c'] }];
  bill.tax = '0.03'; bill.tip = '0';
  assert.deepEqual(calculate(bill).shares.map((p) => p.tax), [1, 1, 1]);
});

test('largest remainder preserves totals across many uneven groups', () => {
  for (let count = 2; count <= 30; count++) {
    for (let cents = 0; cents < 2000; cents += 37) {
      const weights = Array.from({ length: count }, (_, i) => (i * 7 + 3) % 13);
      const result = allocate(cents, weights);
      assert.equal(result.reduce((sum, n) => sum + n, 0), cents);
      result.forEach((n, i) => { assert.ok(Number.isSafeInteger(n) && n >= 0); if (weights[i] === 0) assert.equal(n, 0); });
    }
  }
});

test('draft recovery rejects malformed or stale persisted state', () => {
  assert.equal(validDraft(base()), true);
  assert.equal(Boolean(validDraft(null)), false);
  assert.equal(validDraft({ ...base(), items: [{ name: 'Bad', cents: -1, people: [] }] }), false);
  assert.equal(validDraft({ ...base(), currency: 'XXX' }), false);
});
