import { test } from 'node:test';
import assert from 'node:assert';
import { createSkillRegistry } from './skill-registry.js';

test('createSkillRegistry should register and lookup a skill', () => {
  const registry = createSkillRegistry();
  const skill = { name: 'test' };
  registry.register('test', skill);
  assert.deepStrictEqual(registry.lookup('test'), skill);
});

test('createSkillRegistry should return undefined for unknown skill', () => {
  const registry = createSkillRegistry();
  assert.strictEqual(registry.lookup('unknown'), undefined);
});

test('createSkillRegistry should get deps for a skill', () => {
  const registry = createSkillRegistry();
  const skill = { name: 'test', deps: ['dep1', 'dep2'] };
  registry.register('test', skill);
  assert.deepStrictEqual(registry.getDeps('test'), ['dep1', 'dep2']);
});

test('createSkillRegistry should return empty deps for skill without deps', () => {
  const registry = createSkillRegistry();
  const skill = { name: 'test' };
  registry.register('test', skill);
  assert.deepStrictEqual(registry.getDeps('test'), []);
});

test('createSkillRegistry should check version correctly', () => {
  const registry = createSkillRegistry();
  const skill = { name: 'test', version: '1.0.0' };
  registry.register('test', skill);
  assert.strictEqual(registry.checkVersion('test', '1.0.0'), true);
  assert.strictEqual(registry.checkVersion('test', '2.0.0'), false);
});
