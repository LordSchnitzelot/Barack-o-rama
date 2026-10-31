// Proves the validator catches broken data: each test breaks one rule in a
// copy of the real data and checks that the validator reports it.
// Run: node tools/test-validate-drills.js

'use strict';
const fs = require('fs');
const path = require('path');
const { validate } = require('./validate-drills.js');

const dir = path.join(__dirname, '..', 'packs', 'en-he', 'drills');
const original = {
  en: JSON.parse(fs.readFileSync(path.join(dir, 'dictionary-en.json'), 'utf8')),
  he: JSON.parse(fs.readFileSync(path.join(dir, 'dictionary-he.json'), 'utf8')),
  sentences: JSON.parse(fs.readFileSync(path.join(dir, 'sentences.json'), 'utf8')),
};

function fresh() { return JSON.parse(JSON.stringify(original)); }
function word(d, lang, text) {
  for (const g of d[lang].groups) for (const w of g.words) if (w.text === text) return { g, w };
  throw new Error('test data has no "' + text + '"');
}
function group(d, lang, id) { return d[lang].groups.find(g => g.id === id); }

const tests = [
  ['the real data is valid', d => d, null],
  ['a group with no partner in the other language', d => { d.he.groups.pop(); }, 'has no partner group'],
  ['two groups with the same id', d => { d.en.groups[1].id = d.en.groups[0].id; }, 'is used twice'],
  ['an empty group', d => { d.en.groups[5].words = []; }, 'at least one word'],
  ['the same word in two groups', d => { d.en.groups[3].words.push(d.en.groups[4].words[0]); }, 'used twice'],
  ['two entries with the same text', d => { word(d, 'en', 'bad').w.text = 'good'; }, 'same entry appears twice'],
  ['homonyms without a label', d => { word(d, 'en', 'you (one person)').w.text = 'you'; }, 'each needs a label'],
  ['a past form spelled like another group\'s answer, with no label', d => { word(d, 'en', 'put (past tense)').w.text = 'put'; }, 'needs a label'],
  ['a label that is not English', d => { word(d, 'he', 'לֹא (no)').w.text = 'לֹא (לא)'; }, 'must be English'],
  ['Hebrew without nikkud', d => { word(d, 'he', 'כֶּסֶף').w.text = 'כסף'; }, 'has no nikkud'],
  ['English text in Hebrew dictionary', d => { word(d, 'he', 'כֶּסֶף').w.text = 'money'; }, 'Hebrew letters and nikkud only'],
  ['an English entry with "the"', d => { word(d, 'en', 'money').w.text = 'the money'; }, 'dictionary form'],
  ['a missing rank', d => { delete word(d, 'en', 'money').w.rank; }, '"rank"'],
  ['no accepted forms', d => { word(d, 'en', 'money').w.accepted = []; }, 'at least one accepted'],
  ['accepted form not normalized', d => { word(d, 'he', 'כֶּסֶף').w.accepted = ['כֶּסֶף']; }, 'stored normalized'],
  ['accepted forms missing the word itself', d => { word(d, 'en', 'money').w.accepted = ['cash']; }, 'include the word itself'],
  ['infinitive without "to"', d => { const x = word(d, 'en', 'to go').w; x.text = 'go'; x.accepted = ['go']; }, 'starts with "to"'],
  ['infinitive that does not accept the bare verb', d => { word(d, 'en', 'to go').w.accepted = ['to go']; }, 'without "to"'],
  ['Hebrew past verb missing persons', d => { word(d, 'he', 'הָלַךְ').w.accepted = ['הלך', 'הלכה']; }, 'every person and gender'],
  ['Hebrew adjective missing forms', d => { word(d, 'he', 'גָּדוֹל').w.accepted = ['גדול']; }, 'every gender and number'],
  ['a verb group with no verbForm', d => { delete word(d, 'en', 'to go').g.verbForm; }, 'needs "verbForm"'],
  ['a past form paired with an infinitive', d => { word(d, 'he', 'הָלַךְ').g.verbForm = 'infinitive'; }, 'translates only to a past form'],
  ['otherForm pointing nowhere', d => { word(d, 'en', 'to go').g.otherForm = 99999; }, 'does not exist'],
  ['otherForm not pointing back', d => { const g = word(d, 'en', 'went').g; g.otherForm = word(d, 'en', 'to see').g.id; }, 'must point back'],
  ['empty "say as"', d => { word(d, 'en', 'read (past tense)').w.sayAs = ''; }, '"sayAs"'],
  ['a typo in a field name', d => { const w = word(d, 'en', 'money').w; w.acepted = w.accepted; }, null, 'unknown field'],
  ['a tag pointing at a missing entry', d => { d.sentences.sentences[0].tags[0].word = 'en99999'; }, 'not in dictionary-en'],
  ['a tag pointing at the other language', d => { d.sentences.sentences[0].tags[0].word = 'he1'; }, 'not in dictionary-en'],
  ['a sentence word with no tag', d => { d.sentences.sentences[0].tags.pop(); }, 'has no tag'],
  ['tags out of order', d => { d.sentences.sentences[0].tags.reverse(); }, 'not found in the sentence'],
  ['a wrong difficulty', d => { d.sentences.sentences[0].difficulty = 5; }, '"difficulty" should be'],
  ['an unknown tense', d => { d.sentences.sentences[0].tenses = ['someday']; }, '"tenses"'],
  ['two sentences with the same id', d => { d.sentences.sentences[1].id = d.sentences.sentences[0].id; }, 'is used twice'],
];

let failed = 0;
for (const [name, breakIt, expectError, expectWarning] of tests) {
  const d = fresh();
  breakIt(d);
  const r = validate({ en: d.en, he: d.he }, d.sentences);
  let ok;
  if (expectError === null && !expectWarning) ok = r.errors.length === 0 && r.warnings.length === 0;
  else if (expectError === null) ok = r.errors.length === 0 && r.warnings.some(w => w.includes(expectWarning));
  else ok = r.errors.some(e => e.includes(expectError));
  if (!ok) {
    failed++;
    console.log('FAIL  ' + name);
    console.log('      errors: ' + JSON.stringify(r.errors.slice(0, 3)));
  } else {
    console.log('ok    ' + name);
  }
}
console.log(failed ? failed + ' test(s) failed.' : 'All ' + tests.length + ' tests passed.');
process.exit(failed ? 1 : 0);
