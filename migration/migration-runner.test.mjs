import { createMigrationRunner } from './migration-runner.js';
import assert from 'node:assert';

const migrations = [
  { version: 1 },
  { version: 2 },
  { version: 3 }
];
const runner = createMigrationRunner(migrations);

// 1. Run from 0 to 1
const res1 = runner.run(0, 1);
assert.deepStrictEqual(res1.applied, [1]);
assert.deepStrictEqual(res1.skipped, [2, 3]);

// 2. Run from 1 to 3
const res2 = runner.run(1, 3);
assert.deepStrictEqual(res2.applied, [2, 3]);
assert.deepStrictEqual(res2.skipped, [1]);

// 3. No migrations applied
const res3 = runner.run(3, 4);
assert.deepStrictEqual(res3.applied, []);
assert.deepStrictEqual(res3.skipped, [1, 2, 3]);

// 4. Run empty
const res4 = createMigrationRunner([]).run(0, 1);
assert.deepStrictEqual(res4.applied, []);
assert.deepStrictEqual(res4.skipped, []);

// 5. Run from -1 to 2
const res5 = runner.run(-1, 2);
assert.deepStrictEqual(res5.applied, [1, 2]);
assert.deepStrictEqual(res5.skipped, [3]);
