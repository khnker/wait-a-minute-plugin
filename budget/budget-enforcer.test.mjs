import { test } from 'node:test';
import assert from 'node:assert';
import { enforceBudget } from './budget-enforcer.js';

test('enforceBudget should limit items by maxItems', () => {
  const items = [1, 2, 3, 4, 5];
  const budget = { maxItems: 3 };
  const result = enforceBudget(items, budget);
  assert.strictEqual(result.length, 3);
  assert.deepStrictEqual(result, [1, 2, 3]);
});

test('enforceBudget should return all items if maxItems is not reached', () => {
  const items = [1, 2];
  const budget = { maxItems: 5 };
  const result = enforceBudget(items, budget);
  assert.strictEqual(result.length, 2);
  assert.deepStrictEqual(result, [1, 2]);
});

test('enforceBudget should handle empty items', () => {
  const items = [];
  const budget = { maxItems: 3 };
  const result = enforceBudget(items, budget);
  assert.strictEqual(result.length, 0);
  assert.deepStrictEqual(result, []);
});

test('enforceBudget should handle no budget limit', () => {
  const items = [1, 2, 3];
  const budget = {};
  const result = enforceBudget(items, budget);
  assert.strictEqual(result.length, 3);
  assert.deepStrictEqual(result, [1, 2, 3]);
});

test('enforceBudget should handle maxItems: 0', () => {
  const items = [1, 2, 3];
  const budget = { maxItems: 0 };
  const result = enforceBudget(items, budget);
  assert.strictEqual(result.length, 0);
  assert.deepStrictEqual(result, []);
});
