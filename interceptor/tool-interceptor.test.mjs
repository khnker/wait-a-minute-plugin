import { test } from 'node:test';
import assert from 'node:assert';
import { createToolInterceptor } from './tool-interceptor.js';

test('createToolInterceptor should intercept tool calls', () => {
  const interceptor = createToolInterceptor();
  const handler = (tool, args) => `called ${tool} with ${JSON.stringify(args)}`;
  const result = interceptor.intercept('myTool', { a: 1 }, handler);
  assert.strictEqual(result, 'called myTool with {"a":1}');
});

test('createToolInterceptor should handle sync handler returning value', () => {
  const interceptor = createToolInterceptor();
  const handler = () => 'result';
  const result = interceptor.intercept('tool', {}, handler);
  assert.strictEqual(result, 'result');
});

test('createToolInterceptor should handle async handler', async () => {
  const interceptor = createToolInterceptor();
  const handler = async () => 'async-result';
  const result = await interceptor.intercept('tool', {}, handler);
  assert.strictEqual(result, 'async-result');
});

test('createToolInterceptor should pass arguments correctly', () => {
  const interceptor = createToolInterceptor();
  const handler = (tool, args) => args;
  const args = { foo: 'bar' };
  const result = interceptor.intercept('tool', args, handler);
  assert.deepStrictEqual(result, { foo: 'bar' });
});

test('createToolInterceptor should handle handler error', () => {
  const interceptor = createToolInterceptor();
  const handler = () => { throw new Error('fail'); };
  assert.throws(() => interceptor.intercept('tool', {}, handler), /fail/);
});
