/* Automated tests for dictionary.js. Run with:  node --test
   Uses small made-up sample data in the stored file format (docs/drills-data-format.md). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, findEntry } from './dictionary.js';

const en = { groups: [
  { id: 1, pos: 'verb', verbForm: 'infinitive', words: [{ id: 'en1', text: 'to run', accepted: ['to run', 'run'] }] },
  { id: 2, pos: 'verb', verbForm: 'infinitive', words: [{ id: 'en2', text: 'to run (a business)', accepted: ['to run', 'run'] }] },
  { id: 3, pos: 'verb', verbForm: 'past', words: [{ id: 'en3', text: 'gave up', accepted: ['gave up'] }] },
  { id: 4, pos: 'noun', words: [{ id: 'en4', text: 'cigarette', accepted: ['cigarette'] }] },
  { id: 5, pos: 'adjective', words: [{ id: 'en5', text: 'big', accepted: ['big'] }, { id: 'en6', text: 'large', accepted: ['large'] }] },
] };
const he = { groups: [
  { id: 1, words: [{ id: 'he1', text: 'לָרוּץ', accepted: ['לרוץ'] }] },
  { id: 2, words: [{ id: 'he2', text: 'לְנַהֵל', accepted: ['לנהל'] }] },
  { id: 3, words: [{ id: 'he3', text: 'וִיתֵּר', accepted: ['ויתר', 'ויתרה', 'ויתרתי'] }] },
  { id: 4, words: [{ id: 'he4', text: 'סִיגַרְיָה', accepted: ['סיגריה'] }] },
  { id: 5, words: [{ id: 'he5', text: 'גָּדוֹל', accepted: ['גדול'] }] },
] };
const index = buildIndex(en, he);

test('a form with one entry links to it', () => {
  assert.deepEqual(findEntry(index, 'cigarette', 'סִיגַרְיָה'), { id: 'en4', text: 'cigarette', group: 4 });
  assert.equal(findEntry(index, 'Gave up', '').id, 'en3'); // letter case does not matter
  assert.equal(findEntry(index, 'a cigarette', '').id, 'en4'); // a leading article is ignored
  assert.equal(findEntry(index, 'large', '').id, 'en6'); // each synonym is its own word
});

test('several entries with the same form are told apart by the meaning', () => {
  assert.equal(findEntry(index, 'to run', 'לְנַהֵל').id, 'en2'); // nikkud does not matter
  assert.equal(findEntry(index, 'run', 'לרוץ').id, 'en1');
});

test('no clear match gives no link', () => {
  assert.equal(findEntry(index, 'to run', ''), null);
  assert.equal(findEntry(index, 'to run', 'לטוס'), null);
  assert.equal(findEntry(index, 'give up the ghost', 'מת'), null);
  assert.equal(findEntry(null, 'cigarette', ''), null); // dictionary not loaded
});

test('the starter dictionary loads and links', async () => {
  const fs = await import('node:fs');
  const read = f => JSON.parse(fs.readFileSync(new URL('./packs/en-he/drills/' + f, import.meta.url)));
  const ix = buildIndex(read('dictionary-en.json'), read('dictionary-he.json'));
  assert.equal(findEntry(ix, 'to give', 'לָתֵת').text, 'to give');
  assert.equal(findEntry(ix, 'to know', 'לְהַכִּיר').text, 'to know (a person)');
  assert.equal(findEntry(ix, 'to know', 'לָדַעַת').text, 'to know (a fact)');
});
