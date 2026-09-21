import { test } from 'node:test';
import assert from 'node:assert';
import { buildAuditQuery } from './query-builder.js';

test('buildAuditQuery should build a query with entity', () => {
  const filters = { entity: 'user' };
  const query = buildAuditQuery(filters);
  assert.strictEqual(query.entity, 'user');
});

test('buildAuditQuery should build a query with multiple filters', () => {
  const filters = { entity: 'user', actor: 'admin', action: 'create' };
  const query = buildAuditQuery(filters);
  assert.strictEqual(query.entity, 'user');
  assert.strictEqual(query.actor, 'admin');
  assert.strictEqual(query.action, 'create');
});

test('buildAuditQuery should build a query with outcome', () => {
  const filters = { outcome: 'success' };
  const query = buildAuditQuery(filters);
  assert.strictEqual(query.outcome, 'success');
});

test('buildAuditQuery should build a query with time range', () => {
  const filters = { timeRange: { start: '2026-09-01', end: '2026-09-02' } };
  const query = buildAuditQuery(filters);
  assert.deepStrictEqual(query.timeRange, { start: '2026-09-01', end: '2026-09-02' });
});

test('buildAuditQuery should return an empty object for no filters', () => {
  const query = buildAuditQuery({});
  assert.deepStrictEqual(query, {});
});
