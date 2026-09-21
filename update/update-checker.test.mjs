import { checkUpdates } from './update-checker.js';
import assert from 'node:assert';

// 1. No update needed
const res1 = await checkUpdates('1.1.0', 'https://reg.com');
assert.strictEqual(res1.needsUpdate, false);

// 2. Update needed
const res2 = await checkUpdates('1.0.0', 'https://reg.com');
assert.strictEqual(res2.needsUpdate, true);
assert.strictEqual(res2.latest, '1.1.0');

// 3. Network error
try {
  await checkUpdates('1.0.0', 'https://error.com');
  assert.fail('Should have thrown');
} catch (e) {
  assert.strictEqual(e.message, 'Registry unreachable');
}

// 4. Check return structure
const res4 = await checkUpdates('0.9.0', 'https://reg.com');
assert.ok(res4.hasOwnProperty('latest'));
assert.ok(res4.hasOwnProperty('needsUpdate'));

// 5. Version comparison
const res5 = await checkUpdates('2.0.0', 'https://reg.com');
assert.strictEqual(res5.needsUpdate, true); // Simple string inequality mock
