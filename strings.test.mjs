/* Tests for strings.js, the interface text in English and Hebrew. Run: node --test
   They catch a text missing in one language, a {placeholder} spelled differently in the two, and a
   key used by the page or the code that is not in the table. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { STRINGS, t, setUiLang, setLanguages, langName } from './strings.js';
import { MODES } from './drills.js';
import pack from './packs/en-he/pack.js';

const holes = s => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
const appFiles = readdirSync('.').filter(f => f.endsWith('.js'));

test('English and Hebrew have the same texts, with the same placeholders', () => {
  const en = Object.keys(STRINGS.en), he = Object.keys(STRINGS.he);
  assert.deepEqual(en.filter(k => !(k in STRINGS.he)), [], 'missing in Hebrew');
  assert.deepEqual(he.filter(k => !(k in STRINGS.en)), [], 'missing in English');
  for (const k of en) assert.deepEqual(holes(STRINGS.he[k]), holes(STRINGS.en[k]), 'placeholders differ in ' + k);
});

test('every Hebrew text is translated', () => {
  /* Texts that are the same in both languages on purpose: symbols and product names. */
  const same = new Set(['set.ai']);
  const hebrew = /[א-ת]/;
  for (const [k, v] of Object.entries(STRINGS.he)) {
    if (same.has(k) || /^[^\p{L}]*$/u.test(v)) continue;
    assert.ok(hebrew.test(v), 'not translated: ' + k + ' = ' + v);
  }
});

test('every key used in index.html is in the table', () => {
  const html = readFileSync('index.html', 'utf8');
  const keys = [...html.matchAll(/data-t(?:-aria|-ph)?="([^"]+)"/g)].map(m => m[1]);
  assert.ok(keys.length > 50);
  assert.deepEqual(keys.filter(k => !(k in STRINGS.en)), []);
});

test('every key the code asks for is in the table', () => {
  const used = new Set();
  for (const f of appFiles) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\b(?:t|uiText)\('([a-z]+\.[\w.]+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/'((?:talk|drills|speed|set|sum|voice|words|word|common|store|ai|mic|backup|app|home)\.\w+)'/g)) if (!/\.(m?js|json)$/.test(m[1])) used.add(m[1]);
  }
  assert.ok(used.size > 80, 'found only ' + used.size);
  assert.deepEqual([...used].filter(k => !(k in STRINGS.en)), []);
  /* Keys built from a value: the Drills choices, backup problems and language names. */
  for (const m of MODES) assert.ok(('drills.' + m) in STRINGS.en, 'drills.' + m);
  for (const c of ['bad', 'newer']) assert.ok(('backup.' + c) in STRINGS.en);
  for (const c of [pack.target.code, pack.native.code]) assert.ok(('lang.' + c) in STRINGS.en);
});

test('placeholders are filled, and the language names follow the interface language', () => {
  setLanguages('en', 'he');
  setUiLang('en');
  assert.equal(t('drills.score', { right: 3, total: 10 }), '3 of 10 right');
  assert.equal(t('home.chatDesc'), 'Free conversation with your tutor, in English.');
  assert.equal(t('set.he'), 'Hebrew translation');
  assert.equal(t('no.such.key'), 'no.such.key');
  setUiLang('he');
  assert.equal(t('home.chatDesc'), 'שיחה חופשית עם המורה, באנגלית.');
  assert.equal(t('drills.sayWord', { lang: langName('he') }), 'אמרו את זה בעברית');
  setUiLang('xx'); // an unknown language falls back to English
  assert.equal(t('app.settings'), 'Settings');
  setUiLang('en');
});
