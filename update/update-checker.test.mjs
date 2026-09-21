import { checkUpdates } from './update-checker.js';
import assert from 'node:assert';
import { test } from 'node:test';

// 1. No update needed (current matches mock latest '1.1.0')
test('update-checker: no update needed', async () => {
  const res = await checkUpdates('1.1.0', 'https://reg.com');
  assert.strictEqual(res.needsUpdate, false);
});

// 2. Update needed (current '1.0.0' < mock latest '1.1.0')
test('update-checker: update needed', async () => {
  const res = await checkUpdates('1.0.0', 'https://reg.com');
  assert.strictEqual(res.needsUpdate, true);
  assert.strictEqual(res.latest, '1.1.0');
});

// 3. Network error (mock throws on 'https://error.com')
test('update-checker: network error', async () => {
  try {
    await checkUpdates('1.0.0', 'https://error.com');
    assert.fail('Should have thrown');
  } catch (e) {
    assert.strictEqual(e.message, 'Registry unreachable');
  }
});

// 4. Check return structure
test('update-checker: return structure', async () => {
  const res = await checkUpdates('0.9.0', 'https://reg.com');
  assert.ok(res.hasOwnProperty('latest'));
  assert.ok(res.hasOwnProperty('needsUpdate'));
});

// 5. Version comparison (current > mock latest)
test('update-checker: version ahead', async () => {
  const res = await checkUpdates('2.0.0', 'https://reg.com');
  assert.strictEqual(res.needsUpdate, true);
});