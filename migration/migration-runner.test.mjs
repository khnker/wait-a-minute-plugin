import { createMigrationRunner } from './migration-runner.js';
import assert from 'node:assert';
import { test } from 'node:test';

const migrations = [
  { version: 1 },
  { version: 2 },
  { version: 3 }
];
const runner = createMigrationRunner(migrations);

test('migration-runner: run from 0 to 1', () => {
  const res = runner.run(0, 1);
  assert.deepStrictEqual(res.applied, [1]);
  assert.deepStrictEqual(res.skipped, [2, 3]);
});

test('migration-runner: run from 1 to 3', () => {
  const res = runner.run(1, 3);
  assert.deepStrictEqual(res.applied, [2, 3]);
  assert.deepStrictEqual(res.skipped, [1]);
});

test('migration-runner: no migrations applied', () => {
  const res = runner.run(3, 4);
  assert.deepStrictEqual(res.applied, []);
  assert.deepStrictEqual(res.skipped, [1, 2, 3]);
});

test('migration-runner: run empty', () => {
  const res = createMigrationRunner([]).run(0, 1);
  assert.deepStrictEqual(res.applied, []);
  assert.deepStrictEqual(res.skipped, []);
});

test('migration-runner: run from -1 to 2', () => {
  const res = runner.run(-1, 2);
  assert.deepStrictEqual(res.applied, [1, 2]);
  assert.deepStrictEqual(res.skipped, [3]);
});