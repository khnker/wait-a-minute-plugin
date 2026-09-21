import { test } from 'node:test';
import assert from 'node:assert';
import { recover } from './error-recovery.js';

test('recover should retry when retry is true', () => {
  const error = new Error('fail');
  const context = { retry: true };
  const result = recover(error, context);
  assert.strictEqual(result.recovered, true);
  assert.strictEqual(result.action, 'retry');
});

test('recover should fallback when fallback is true', () => {
  const error = new Error('fail');
  const context = { fallback: true };
  const result = recover(error, context);
  assert.strictEqual(result.recovered, true);
  assert.strictEqual(result.action, 'fallback');
});

test('recover should open circuit when circuitOpen is true', () => {
  const error = new Error('fail');
  const context = { circuitOpen: true };
  const result = recover(error, context);
  assert.strictEqual(result.recovered, false);
  assert.strictEqual(result.action, 'circuit-open');
});

test('recover should not recover when no context provided', () => {
  const error = new Error('fail');
  const result = recover(error, {});
  assert.strictEqual(result.recovered, false);
  assert.strictEqual(result.error, error);
});

test('recover should prioritize retry over fallback', () => {
  const error = new Error('fail');
  const context = { retry: true, fallback: true };
  const result = recover(error, context);
  assert.strictEqual(result.recovered, true);
  assert.strictEqual(result.action, 'retry');
});
