import { test } from 'node:test';
import assert from 'node:assert';
import { validateConfig } from './config-validator.js';

test('validateConfig passes a valid config', () => {
  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string', required: true, minLength: 1 },
      retries: { type: 'integer', required: true, minimum: 0 },
      verbose: { type: 'boolean' },
    },
  };
  const r = validateConfig({ name: 'a', retries: 3, verbose: true }, schema);
  assert.strictEqual(r.valid, true);
  assert.deepStrictEqual(r.errors, []);
});

test('validateConfig reports missing required string', () => {
  const schema = { type: 'object', properties: { name: { type: 'string', required: true } } };
  const r = validateConfig({}, schema);
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('required')));
});

test('validateConfig flags wrong type for number', () => {
  const schema = { type: 'object', properties: { p: { type: 'number', required: true } } };
  const r = validateConfig({ p: 'not-number' }, schema);
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('expected number')));
});

test('validateConfig enforces minLength on strings', () => {
  const schema = { type: 'object', properties: { s: { type: 'string', minLength: 3 } } };
  const r = validateConfig({ s: 'ab' }, schema);
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('minLength')));
});

test('validateConfig validates nested objects', () => {
  const schema = {
    type: 'object',
    properties: {
      db: {
        type: 'object',
        properties: {
          host: { type: 'string', required: true },
          port: { type: 'integer', required: true, minimum: 1, maximum: 65535 },
        },
      },
    },
  };
  const r = validateConfig({ db: { host: 'localhost', port: -1 } }, schema);
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('port') && e.includes('minimum')));
});

test('validateConfig detects unexpected properties when additionalProperties:false', () => {
  const schema = {
    type: 'object',
    properties: { a: { type: 'string' } },
    additionalProperties: false,
  };
  const r = validateConfig({ a: 'x', b: 'y' }, schema);
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('unexpected')));
});

test('validateConfig enforces array minItems and item type', () => {
  const schema = {
    type: 'object',
    properties: {
      tags: { type: 'array', minItems: 1, items: { type: 'string', required: true } },
    },
  };
  const r = validateConfig({ tags: ['a', 2] }, schema);
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('expected string')));
});

test('validateConfig enforces string enum', () => {
  const schema = {
    type: 'object',
    properties: { mode: { type: 'string', enum: ['fast', 'slow'] } },
  };
  const r = validateConfig({ mode: 'medium' }, schema);
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('must be one of')));
});
