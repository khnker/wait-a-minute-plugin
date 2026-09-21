import { test } from 'node:test';
import assert from 'node:assert';
import { createContextCache } from './context-cache.js';

test('createContextCache sets and gets a value', () => {
  const cache = createContextCache({ ttlMs: 1000 });
  cache.set('a', 1);
  assert.strictEqual(cache.get('a'), 1);
});

test('createContextCache expires entries after ttl', async () => {
  const cache = createContextCache({ ttlMs: 30 });
  cache.set('a', 'value');
  assert.strictEqual(cache.get('a'), 'value');
  await new Promise((r) => setTimeout(r, 80));
  assert.strictEqual(cache.get('a'), undefined);
});

test('createContextCache supports custom ttl per set', async () => {
  const cache = createContextCache({ ttlMs: 1000 });
  cache.set('short', 'v', 20);
  await new Promise((r) => setTimeout(r, 60));
  assert.strictEqual(cache.get('short'), undefined);
  cache.set('long', 'v', 1000);
  assert.strictEqual(cache.get('long'), 'v');
});

test('createContextCache evicts oldest when over maxEntries', () => {
  const cache = createContextCache({ ttlMs: 10_000, maxEntries: 2 });
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3);
  assert.strictEqual(cache.get('a'), undefined);
  assert.strictEqual(cache.get('b'), 2);
  assert.strictEqual(cache.get('c'), 3);
});

test('createContextCache has and size report correctly', () => {
  const cache = createContextCache({ ttlMs: 10_000 });
  assert.strictEqual(cache.has('x'), false);
  cache.set('x', 'y');
  assert.strictEqual(cache.has('x'), true);
  assert.strictEqual(cache.size(), 1);
});

test('createContextCache delete and clear work', () => {
  const cache = createContextCache({ ttlMs: 10_000 });
  cache.set('a', 1);
  cache.set('b', 2);
  assert.strictEqual(cache.delete('a'), true);
  assert.strictEqual(cache.has('a'), false);
  cache.clear();
  assert.strictEqual(cache.size(), 0);
});

test('createContextCache keys returns only live entries', async () => {
  const cache = createContextCache({ ttlMs: 500 });
  cache.set('live', 1);
  cache.set('dead', 2, 30);
  await new Promise((r) => setTimeout(r, 80));
  const ks = cache.keys();
  assert.ok(ks.includes('live'));
  assert.ok(!ks.includes('dead'));
});
