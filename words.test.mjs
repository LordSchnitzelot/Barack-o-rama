/* Automated tests for words.js. Run with:  node --test */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as W from './words.js';

const entry = { id: 'en2', text: 'to run (a business)', group: 2 };

test('tapping a word saves it with an "understands" score of 0, due now', () => {
  const r = W.flag(null, { text: 'run', meaning: 'לְנַהֵל', example: 'She runs a shop.', source: 'tapped', entry, lang: 'en' }, 1000);
  assert.equal(r.id, 'en2');
  assert.equal(r.text, 'to run (a business)');
  assert.equal(r.entry, 'en2');
  assert.equal(r.example, 'She runs a shop.');
  assert.equal(W.score(r.understand), 0);
  assert.equal(r.understand.weak, true);
  assert.equal(r.say, null); // tapping is about understanding
  assert.equal(W.nextReview(r), 1000);
  assert.equal(r.created, 1000);
  assert.equal(r.modified, 1000);
});

test('"How do I say it?" is about speaking', () => {
  const r = W.flag(null, { text: 'I would like a coffee', meaning: 'אני רוצה קפה', source: 'how-do-I-say-it', entry: null, lang: 'en' }, 5);
  assert.equal(r.id, 't:i would like a coffee');
  assert.equal(r.entry, null);
  assert.equal(r.understand, null);
  assert.equal(r.say.weak, true);
});

test('flagging again keeps one record and adds the source', () => {
  const a = W.flag(null, { text: 'cigarette', meaning: '', source: 'tapped', entry: null, lang: 'en' }, 1);
  a.understand.level = 3;
  const b = W.flag(a, { text: 'cigarette', meaning: 'סִיגַרְיָה', source: 'how-do-I-say-it', entry: null, lang: 'en' }, 2);
  assert.equal(b.sources.length, 2);
  assert.equal(b.meaning, 'סִיגַרְיָה'); // filled in when it was missing
  assert.equal(W.score(b.understand), 3); // an existing score is kept
  assert.equal(W.score(b.say), 0);
  assert.equal(b.modified, 2);
});

test('the first demo\'s word list is carried over', () => {
  const link = w => /^run/.test(w) ? (w === 'run' ? entry : null) : null;
  const out = W.fromOldList([{ w: 'run', m: 'לנהל', src: 'tapped', t: 7 }, { w: 'Ship', m: 'ספינה', t: 8 }, { w: 'running', m: 'לנהל', t: 9 }, null], link, 'en');
  assert.deepEqual(out.map(r => r.id), ['en2']); // "Ship" is not in the dictionary, so it is dropped
  assert.equal(out[0].sources.length, 1);
});
