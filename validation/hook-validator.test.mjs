import { test } from 'node:test';
import assert from 'node:assert';
import { validateHook } from './hook-validator.js';

test('validateHook should return valid for correct hook', () => {
  const hook = { name: 'test', callback: () => {} };
  const result = validateHook(hook);
  assert.strictEqual(result.valid, true);
  assert.deepStrictEqual(result.errors, []);
});

test('validateHook should return invalid for missing name', () => {
  const hook = { callback: () => {} };
  const result = validateHook(hook);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.includes('Missing hook name'));
});

test('validateHook should return invalid for missing callback', () => {
  const hook = { name: 'test' };
  const result = validateHook(hook);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.includes('Missing callback'));
});

test('validateHook should return invalid for missing both name and callback', () => {
  const hook = {};
  const result = validateHook(hook);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.includes('Missing hook name'));
  assert.ok(result.errors.includes('Missing callback'));
});

test('validateHook should handle null hook', () => {
  const result = validateHook(null);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.length >= 1);
});
