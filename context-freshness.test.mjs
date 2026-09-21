
import { strict as assert } from 'node:assert';
import { calculateStaleness, isStale, updateLastAccess } from './context-freshness.js';

// Test calculateStaleness
const now = 10000;
const item = { timestamp: 5000 };
assert.strictEqual(calculateStaleness(item, now), 5000);

// Test isStale
const ttl = 4000;
assert.strictEqual(isStale(item, ttl, now), true);
assert.strictEqual(isStale(item, 6000, now), false);

// Test updateLastAccess
const updated = updateLastAccess(item, 10000);
assert.strictEqual(updated.lastAccess, 10000);

console.log("context-freshness.test.mjs passed");
