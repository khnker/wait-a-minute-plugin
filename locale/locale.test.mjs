import { createLocale } from './locale.js';
import assert from 'node:assert';

const dict = {
  en: { "hello": "Hello {name}", "bye": "Bye" },
  es: { "hello": "Hola {name}", "bye": "Adiós" }
};

const l = createLocale('en', dict);

// 1. Basic translation
assert.strictEqual(l.t('bye'), 'Bye');
// 2. Translation with vars
assert.strictEqual(l.t('hello', { name: 'World' }), 'Hello World');
// 3. Changing language
l.setLang('es');
assert.strictEqual(l.t('bye'), 'Adiós');
// 4. Changing language with vars
assert.strictEqual(l.t('hello', { name: 'Mundo' }), 'Hola Mundo');
// 5. Fallback to key
assert.strictEqual(l.t('missing'), 'missing');
