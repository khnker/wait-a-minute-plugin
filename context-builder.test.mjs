
import { strict as assert } from 'node:assert';
import { build } from './context-builder.js';

const now = Date.now();
const context = [
  { id: '1', content: 'hello world', timestamp: now - 1000 },
  { id: '2', content: 'test', timestamp: now - 50000 },
];
const query = { keywords: ['hello'] };

const result = build({ context, query, options: { maxItems: 1, ttl: 10000 } });

// Test budget enforcement
assert.strictEqual(result.items.length, 1);
// Test promotion (hello world should be promoted due to keywords)
assert.strictEqual(result.items[0].id, '1');
assert.strictEqual(result.items[0].isPromoted, true);

// Test provenance
assert.ok(result.provenance.timestamp <= now);
assert.strictEqual(result.provenance.method, 'build');

console.log("context-builder.test.mjs passed");
