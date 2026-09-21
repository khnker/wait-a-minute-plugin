import { test } from 'node:test';
import assert from 'node:assert';
import { createHealthChecker } from './health-checker.js';

test('createHealthChecker exposes register and check', () => {
  const h = createHealthChecker();
  assert.strictEqual(typeof h.register, 'function');
  assert.strictEqual(typeof h.check, 'function');
  assert.strictEqual(typeof h.list, 'function');
});

test('runs registered check and reports ok status', async () => {
  const h = createHealthChecker();
  h.register('ping', async () => true);
  const r = await h.check('ping');
  assert.strictEqual(r.name, 'ping');
  assert.strictEqual(r.status, 'ok');
  assert.ok(typeof r.latencyMs === 'number');
});

test('check() aggregates overall status as ok when all pass', async () => {
  const h = createHealthChecker();
  h.register('a', async () => true);
  h.register('b', async () => true);
  const r = await h.check();
  assert.strictEqual(r.overall, 'ok');
  assert.strictEqual(r.checks.length, 2);
});

test('check() reports degraded when some fail', async () => {
  const h = createHealthChecker();
  h.register('good', async () => true);
  h.register('bad', async () => { throw new Error('boom'); });
  const r = await h.check();
  assert.strictEqual(r.overall, 'degraded');
  const bad = r.checks.find((c) => c.name === 'bad');
  assert.strictEqual(bad.status, 'fail');
  assert.match(bad.error, /boom/);
});

test('check() reports fail when none pass', async () => {
  const h = createHealthChecker();
  h.register('a', async () => { throw new Error('x'); });
  h.register('b', async () => { throw new Error('y'); });
  const r = await h.check();
  assert.strictEqual(r.overall, 'fail');
});

test('register rejects non-function check', () => {
  const h = createHealthChecker();
  assert.throws(() => h.register('bad', 'not-a-fn'), TypeError);
});

test('check on unknown name returns unknown status', async () => {
  const h = createHealthChecker();
  const r = await h.check('missing');
  assert.strictEqual(r.status, 'unknown');
});
