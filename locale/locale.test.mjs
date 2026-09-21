import { createLocale } from './locale.js';
import assert from 'node:assert';
import { test } from 'node:test';

const dict = {
  en: { "hello": "Hello {name}", "bye": "Bye" },
  es: { "hello": "Hola {name}", "bye": "Adiós" }
};

test('locale: basic translation', () => {
  const l = createLocale('en', dict);
  assert.strictEqual(l.t('bye'), 'Bye');
});

test('locale: translation with vars', () => {
  const l = createLocale('en', dict);
  assert.strictEqual(l.t('hello', { name: 'World' }), 'Hello World');
});

test('locale: changing language', () => {
  const l = createLocale('en', dict);
  l.setLang('es');
  assert.strictEqual(l.t('bye'), 'Adiós');
});

test('locale: changing language with vars', () => {
  const l = createLocale('en', dict);
  l.setLang('es');
  assert.strictEqual(l.t('hello', { name: 'Mundo' }), 'Hola Mundo');
});

test('locale: fallback to key when missing', () => {
  const l = createLocale('en', dict);
  assert.strictEqual(l.t('missing'), 'missing');
});
