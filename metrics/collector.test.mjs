import { test } from 'node:test';
import assert from 'node:assert';
import { createMetricsCollector } from './collector.js';

test('createMetricsCollector returns API with record and getSnapshot', () => {
  const m = createMetricsCollector();
  assert.strictEqual(typeof m.record, 'function');
  assert.strictEqual(typeof m.getSnapshot, 'function');
});

test('records a single metric and computes statistics', () => {
  const m = createMetricsCollector();
  m.record('latency', 10);
  m.record('latency', 20);
  m.record('latency', 30);
  const snap = m.getSnapshot();
  assert.strictEqual(snap.length, 1);
  assert.strictEqual(snap[0].name, 'latency');
  assert.strictEqual(snap[0].count, 3);
  assert.strictEqual(snap[0].sum, 60);
  assert.strictEqual(snap[0].min, 10);
  assert.strictEqual(snap[0].max, 30);
  assert.strictEqual(snap[0].avg, 20);
});

test('separates series by tags', () => {
  const m = createMetricsCollector();
  m.record('req', 1, { route: '/a' });
  m.record('req', 2, { route: '/a' });
  m.record('req', 10, { route: '/b' });
  const snap = m.getSnapshot();
  assert.strictEqual(snap.length, 2);
  const a = snap.find((s) => s.tags.route === '/a');
  const b = snap.find((s) => s.tags.route === '/b');
  assert.strictEqual(a.count, 2);
  assert.strictEqual(a.sum, 3);
  assert.strictEqual(b.count, 1);
  assert.strictEqual(b.sum, 10);
});

test('computes percentiles p50/p95/p99', () => {
  const m = createMetricsCollector();
  for (let i = 1; i <= 100; i++) m.record('x', i);
  const snap = m.getSnapshot();
  // Different percentile conventions (inclusive/exclusive/interpolated) yield
  // values within ±1 of the index. Assert tolerance.
  assert.ok(Math.abs(snap[0].p50 - 50) <= 1, `p50 expected ~50, got ${snap[0].p50}`);
  assert.ok(Math.abs(snap[0].p95 - 95) <= 1, `p95 expected ~95, got ${snap[0].p95}`);
  assert.ok(Math.abs(snap[0].p99 - 99) <= 1, `p99 expected ~99, got ${snap[0].p99}`);
});

test('reset clears all series', () => {
  const m = createMetricsCollector();
  m.record('a', 1);
  m.record('b', 2);
  assert.strictEqual(m.getSnapshot().length, 2);
  m.reset();
  assert.strictEqual(m.getSnapshot().length, 0);
});

test('tags are independent of order', () => {
  const m = createMetricsCollector();
  m.record('q', 5, { a: 1, b: 2 });
  m.record('q', 7, { b: 2, a: 1 });
  const snap = m.getSnapshot();
  assert.strictEqual(snap.length, 1);
  assert.strictEqual(snap[0].count, 2);
  assert.strictEqual(snap[0].sum, 12);
});
