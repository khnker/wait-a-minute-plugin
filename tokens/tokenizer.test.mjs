import { test } from 'node:test';
import assert from 'node:assert';
import { countTokens } from './tokenizer.js';

test('countTokens returns 0 for empty/null/undefined input', () => {
  assert.strictEqual(countTokens(''), 0);
  assert.strictEqual(countTokens(null), 0);
  assert.strictEqual(countTokens(undefined), 0);
});

test('countTokens counts simple ASCII word tokens', () => {
  assert.strictEqual(countTokens('hello world'), 2);
  assert.strictEqual(countTokens('hello'), 1);
});

test('countTokens handles punctuation contractions', () => {
  const t = countTokens("don't worry, it's fine");
  assert.ok(t >= 4);
});

test('countTokens approximates higher for multibyte content', () => {
  const ascii = countTokens('hello world');
  const unicode = countTokens('héllo wörld');
  assert.ok(unicode > ascii);
});

test('countTokens scales roughly with text length', () => {
  const short = countTokens('hi');
  const long = countTokens('hi '.repeat(50));
  assert.ok(long > short * 5);
});

test('countTokens handles numbers and symbols', () => {
  const t = countTokens('price is $42.99 today');
  assert.ok(t >= 4);
});
