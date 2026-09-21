import { test } from 'node:test';
import assert from 'node:assert';
import { buildPrompt } from './prompt-engine.js';

test('buildPrompt returns parts with roles when no budget is exceeded', () => {
  const result = buildPrompt({
    system: 'You are helpful.',
    context: 'Some context.',
    user: 'Hello.',
  });
  assert.strictEqual(result.truncated, false);
  assert.strictEqual(result.parts.length, 3);
  assert.strictEqual(result.parts[0].role, 'system');
  assert.strictEqual(result.parts[1].role, 'context');
  assert.strictEqual(result.parts[2].role, 'user');
});

test('buildPrompt respects budget and truncates when over', () => {
  const long = ('word '.repeat(1000)).trim(); // ~1000 tokens of context
  const result = buildPrompt(
    {
      system: 'sys',
      context: long,
      user: 'question',
    },
    { maxTokens: 50 }
  );
  assert.strictEqual(result.truncated, true);
  assert.ok(result.totalTokens <= 50 + 5); // small slack for truncation marker
  // system should be preserved (highest priority)
  assert.strictEqual(result.parts[0].content, 'sys');
});

test('buildPrompt preserves user when reservedForUser is set', () => {
  const result = buildPrompt(
    { user: 'important question please' },
    { maxTokens: 5, reservedForUser: 5 }
  );
  assert.ok(result.parts.find((p) => p.role === 'user' && p.content.length > 0));
});

test('buildPrompt handles missing optional parts', () => {
  const result = buildPrompt({ user: 'only user' });
  assert.strictEqual(result.parts.length, 1);
  assert.strictEqual(result.parts[0].role, 'user');
});

test('buildPrompt records totalTokens for input', () => {
  const result = buildPrompt({
    system: 'sys',
    context: 'ctx',
    user: 'usr',
  }, { maxTokens: 1000 });
  assert.ok(result.totalTokens > 0);
  assert.strictEqual(result.truncated, false);
});

test('buildPrompt truncates context first when only context is oversized', () => {
  const long = ('ctx '.repeat(2000)).trim();
  const result = buildPrompt(
    {
      system: 'sys',
      context: long,
      user: 'u',
    },
    { maxTokens: 50 }
  );
  assert.strictEqual(result.truncated, true);
  // System preserved (highest priority).
  assert.strictEqual(result.parts[0].content, 'sys');
  // Context truncated significantly.
  assert.ok(result.parts[1].content.length < long.length);
  assert.ok(result.totalTokens <= 50 + 5);
});
