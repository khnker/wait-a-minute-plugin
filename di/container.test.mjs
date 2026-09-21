import { test } from 'node:test';
import assert from 'node:assert';
import { createContainer } from './container.js';

test('createContainer registers and resolves a singleton', () => {
  const c = createContainer();
  let counter = 0;
  c.register('svc', () => ({ id: ++counter }));
  const a = c.resolve('svc');
  const b = c.resolve('svc');
  assert.strictEqual(a, b);
  assert.strictEqual(a.id, 1);
});

test('createContainer rejects non-function factory', () => {
  const c = createContainer();
  assert.throws(() => c.register('bad', 'nope'), TypeError);
});

test('createContainer throws for unregistered dependency', () => {
  const c = createContainer();
  assert.throws(() => c.resolve('missing'), /not registered/);
});

test('createContainer supports non-singleton factories', () => {
  const c = createContainer();
  let counter = 0;
  c.register('fresh', () => ({ id: ++counter }), { singleton: false });
  const a = c.resolve('fresh');
  const b = c.resolve('fresh');
  assert.notStrictEqual(a, b);
  assert.strictEqual(a.id, 1);
  assert.strictEqual(b.id, 2);
});

test('createContainer has and list report registrations', () => {
  const c = createContainer();
  c.register('a', () => 1);
  c.register('b', () => 2);
  assert.deepStrictEqual(c.list().sort(), ['a', 'b']);
  assert.strictEqual(c.has('a'), true);
  assert.strictEqual(c.has('z'), false);
});

test('createContainer unregister and clear', () => {
  const c = createContainer();
  c.register('x', () => 1);
  assert.strictEqual(c.unregister('x'), true);
  assert.strictEqual(c.unregister('x'), false);
  c.register('y', () => 2);
  c.clear();
  assert.strictEqual(c.has('y'), false);
});

test('createContainer resolves transitive dependencies', () => {
  const c = createContainer();
  c.register('config', () => ({ token: 'abc' }));
  c.register('client', () => ({ cfg: c.resolve('config') }));
  const cl = c.resolve('client');
  assert.strictEqual(cl.cfg.token, 'abc');
});
