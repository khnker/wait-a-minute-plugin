import { test } from 'node:test';
import assert from 'node:assert';
import { replayEvents } from './replay-engine.js';

test('replayEvents should apply events to initial state', () => {
  const initialState = { a: 1 };
  const events = [{ b: 2 }, { c: 3 }];
  const result = replayEvents(events, initialState);
  assert.deepStrictEqual(result, { a: 1, b: 2, c: 3 });
});

test('replayEvents should handle empty events', () => {
  const initialState = { a: 1 };
  const events = [];
  const result = replayEvents(events, initialState);
  assert.deepStrictEqual(result, { a: 1 });
});

test('replayEvents should handle events overriding properties', () => {
  const initialState = { a: 1 };
  const events = [{ a: 2 }];
  const result = replayEvents(events, initialState);
  assert.deepStrictEqual(result, { a: 2 });
});

test('replayEvents should handle empty initial state', () => {
  const initialState = {};
  const events = [{ a: 1 }];
  const result = replayEvents(events, initialState);
  assert.deepStrictEqual(result, { a: 1 });
});

test('replayEvents should be deterministic', () => {
  const initialState = { a: 1 };
  const events = [{ b: 2 }, { c: 3 }];
  const result1 = replayEvents(events, initialState);
  const result2 = replayEvents(events, initialState);
  assert.deepStrictEqual(result1, result2);
});
