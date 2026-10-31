/* Automated tests for drill-data.js. Run with:  node --test */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as DD from './drill-data.js';
import * as D from './drills.js';

const files = {
  target: { language: 'en', groups: [
    { id: 1, pos: 'adjective', words: [{ id: 'en1', text: 'big', rank: 5, accepted: ['big'] }, { id: 'en2', text: 'large', rank: 50, accepted: ['large'] }] },
    { id: 2, pos: 'noun', words: [{ id: 'en3', text: 'dog', rank: 2, accepted: ['dog', 'dogs'] }] },
  ] },
  native: { language: 'he', groups: [
    { id: 1, pos: 'adjective', words: [{ id: 'he1', text: 'גָּדוֹל', rank: 4, accepted: ['גדול', 'גדולה'] }] },
    { id: 2, pos: 'noun', words: [{ id: 'he2', text: 'כֶּלֶב', rank: 3, accepted: ['כלב'] }] },
  ] },
  sentences: { sentences: [{ id: 'en-s1', language: 'en', text: 'The dog is big.', difficulty: 1, tags: [{ text: 'dog', word: 'en3' }, { text: 'big', word: 'en1' }] }] },
};

test('the stored files become drills.js data', () => {
  const data = DD.toDrillsData(files);
  assert.equal(data.target, 'en');
  assert.equal(data.dicts.en[1][1].text, 'large');
  assert.deepEqual(data.dicts.he[2][0].forms, ['כלב']);
  assert.deepEqual(data.sentences[0].tags.map(t => [t.group, t.word]), [['2', 0], ['1', 0]]);
  assert.deepEqual(data.where.en2, { group: '1', word: 1 });
  /* drills.js can check answers on it */
  assert.equal(D.checkWordAnswer(data, { lang: 'en', group: '1', word: 1 }, 'גדולה').result, 'right');
});

test('My words records become Drills progress, and back', () => {
  const data = DD.toDrillsData(files);
  const flagged = { id: 'en2', entry: 'en2', text: 'large', meaning: 'גָּדוֹל', sources: [{ source: 'tapped', time: 1 }], understand: Object.assign(D.newRecord(1), { weak: true }), say: null };
  const profile = DD.progressFromWords(data, [flagged, { id: 't:x', entry: null }]);
  assert.deepEqual(Object.keys(profile.progress), ['1:1']);
  assert.equal(profile.progress['1:1'].understand.weak, true);

  D.review(profile.progress['1:1'].understand, true, 5);
  profile.progress['2:0'] = { say: D.review(D.newRecord(5), true, 5) };
  const out = DD.wordsFromProgress(data, profile, new Map([['en2', flagged]]), ['1:1', '2:0'], e => e.text === 'dog' ? 'כֶּלֶב' : '', 5);
  assert.deepEqual(out.map(r => r.id), ['en2', 'en3']);
  assert.equal(out[0].sources.length, 1); // the flag is kept
  assert.equal(out[1].meaning, 'כֶּלֶב');
  assert.equal(out[1].say.level, 1);
  assert.ok(DD.isListed(out[0]) && !DD.isListed(out[1])); // a drilled, known word is not listed in My words
});
