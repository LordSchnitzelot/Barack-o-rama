/* Automated tests for dictionary.js. Run with:  node --test
   Uses small made-up sample data in the stored file format (docs/drills-data-format.md). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, findEntry, lookup, findInText, phrasesInText, wordsInPhrase, meaningOf, isPhrase } from './dictionary.js';

const en = { groups: [
  { id: 1, pos: 'verb', verbForm: 'infinitive', words: [{ id: 'en1', text: 'to run', accepted: ['to run', 'run'] }] },
  { id: 2, pos: 'verb', verbForm: 'infinitive', words: [{ id: 'en2', text: 'to run (a business)', accepted: ['to run', 'run'] }] },
  { id: 3, pos: 'verb', verbForm: 'past', words: [{ id: 'en3', text: 'gave up', accepted: ['gave up'] }] },
  { id: 4, pos: 'noun', words: [{ id: 'en4', text: 'cigarette', accepted: ['cigarette'] }] },
  { id: 5, pos: 'adjective', words: [{ id: 'en5', text: 'big', accepted: ['big'] }, { id: 'en6', text: 'large', accepted: ['large'] }] },
  { id: 6, pos: 'verb', verbForm: 'infinitive', words: [{ id: 'en7', text: 'to take care', accepted: ['to take care', 'take care'] }] },
  { id: 7, pos: 'verb', verbForm: 'infinitive', words: [{ id: 'en8', text: 'to take', accepted: ['to take', 'take'] }] },
  { id: 8, pos: 'verb', verbForm: 'infinitive', words: [{ id: 'en9', text: 'to look up (search)', accepted: ['to look up', 'look up'] }] },
  { id: 9, pos: 'verb', verbForm: 'infinitive', words: [{ id: 'en10', text: 'to look up to', accepted: ['to look up to', 'look up to'] }] },
  { id: 10, pos: 'pronoun', words: [{ id: 'en11', text: 'I', accepted: ['i'] }] },
  { id: 11, pos: 'noun', words: [{ id: 'en12', text: 'coffee', accepted: ['coffee'] }] },
  { id: 12, pos: 'verb', verbForm: 'infinitive', words: [{ id: 'en13', text: 'to want', accepted: ['to want', 'want'] }] },
] };
const he = { groups: [
  { id: 1, words: [{ id: 'he1', text: 'לָרוּץ', accepted: ['לרוץ'] }] },
  { id: 2, words: [{ id: 'he2', text: 'לְנַהֵל', accepted: ['לנהל'] }] },
  { id: 3, words: [{ id: 'he3', text: 'וִיתֵּר', accepted: ['ויתר', 'ויתרה', 'ויתרתי'] }] },
  { id: 4, words: [{ id: 'he4', text: 'סִיגַרְיָה', accepted: ['סיגריה'] }] },
  { id: 5, words: [{ id: 'he5', text: 'גָּדוֹל', accepted: ['גדול'] }] },
  { id: 6, words: [{ id: 'he6', text: 'לִשְׁמוֹר', accepted: ['לשמור'] }] },
  { id: 7, words: [{ id: 'he7', text: 'לָקַחַת', accepted: ['לקחת'] }] },
  { id: 8, words: [{ id: 'he8', text: 'לְחַפֵּשׂ', accepted: ['לחפש'] }] },
  { id: 9, words: [{ id: 'he9', text: 'לְהַעֲרִיץ', accepted: ['להעריץ'] }] },
  { id: 10, words: [{ id: 'he10', text: 'אֲנִי', accepted: ['אני'] }] },
  { id: 11, words: [{ id: 'he11', text: 'קָפֶה', accepted: ['קפה'] }] },
  { id: 12, words: [{ id: 'he12', text: 'לִרְצוֹת', accepted: ['לרצות'] }] },
] };
const index = buildIndex(en, he);

test('a form with one entry links to it', () => {
  assert.deepEqual(findEntry(index, 'cigarette', 'סִיגַרְיָה'), { id: 'en4', text: 'cigarette', group: 4, pos: 'noun' });
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

test('when the code cannot tell entries apart, it lists them for the AI to choose', () => {
  const r = lookup(index, 'to run', 'לָטוּס');
  assert.equal(r.entry, null);
  assert.deepEqual(r.candidates.map(e => e.text), ['to run', 'to run (a business)']);
  assert.deepEqual(r.candidates.map(e => meaningOf(index, e)), ['לָרוּץ', 'לְנַהֵל']);
  assert.deepEqual(lookup(index, 'smoking', ''), { entry: null, candidates: [] }); // not in the dictionary
});

test('dictionary phrases are found in a sentence, longest first', () => {
  const hits = findInText(index, 'Take care, and look up to your big brother!');
  assert.deepEqual(hits.map(h => h.text), ['Take care', 'look up to', 'big']);
  assert.ok(isPhrase({ text: 'to take care' }) && isPhrase({ text: 'look up (search)' }));
  assert.ok(!isPhrase({ text: 'to take' }) && !isPhrase({ text: 'bat (sports)' }));
});

test('phrases become tappable units, whatever the AI listed', () => {
  const ai = [{ w: 'Take', d: 'to take', m: 'לִשְׁמוֹר' }, { w: 'care', d: 'care', m: 'לִשְׁמוֹר' }];
  assert.deepEqual(phrasesInText(index, 'Take care of yourself.', ai), [{ w: 'Take care', d: 'to take care', m: 'לִשְׁמוֹר' }]);
  assert.deepEqual(phrasesInText(index, 'I take the bus.', []), []); // a single word is not added
  assert.deepEqual(phrasesInText(index, 'Look it up.', []), []); // a split phrase is left to the AI
});

test('How do I say it saves the dictionary words inside the answer', () => {
  const found = wordsInPhrase(index, 'I want a big coffee', 'אני רוצה קפה גדול');
  assert.deepEqual(found.map(e => e.text), ['to want', 'big', 'coffee']); // "I" is a pronoun, so it is skipped
  /* Several entries: the one whose meaning the learner said is kept; otherwise none. */
  assert.deepEqual(wordsInPhrase(index, 'I run a shop', 'אני מנהל חנות').map(e => e.text), []);
  assert.deepEqual(wordsInPhrase(index, 'I want to run', 'אני רוצה לנהל').map(e => e.text), ['to want', 'to run (a business)']);
});

test('future and command forms ("seenAs") point at the infinitive, but are not answers', () => {
  const ix = buildIndex(
    { groups: [{ id: 1, pos: 'verb', verbForm: 'infinitive', words: [{ id: 'en1', text: 'to go', accepted: ['to go', 'go'] }] }] },
    { groups: [{ id: 1, pos: 'verb', verbForm: 'infinitive', words: [{ id: 'he1', text: 'לָלֶכֶת', accepted: ['ללכת', 'הולך'], seenAs: ['אלך', 'לך'] }] }] });
  const he = buildIndex(
    { groups: [{ id: 1, words: [{ id: 'he1', text: 'לָלֶכֶת', accepted: ['ללכת'], seenAs: ['אלך'] }] }] },
    { groups: [{ id: 1, words: [{ id: 'en1', text: 'to go', accepted: ['to go'] }] }] });
  assert.deepEqual(findInText(he, 'אני אלך מחר').map(h => h.candidates[0].id), ['he1']);
  assert.equal(findEntry(ix, 'to go', 'אלך').id, 'en1'); // the meaning may be given in the future form
});
