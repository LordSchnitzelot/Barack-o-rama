/* Automated tests for tutor.js. Run with:  node --test */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from './tutor.js';
import pack from './packs/en-he/pack.js';

test('the pack names both languages and a voice for each', () => {
  assert.equal(pack.target.code, 'en');
  assert.equal(pack.native.code, 'he');
  assert.ok(pack.target.voice && pack.native.voice);
  for (const k of ['beginner', 'intermediate', 'advanced']) assert.ok(pack.tutor.levels[k]);
  for (const k of ['live', 'end', 'off']) assert.ok(pack.tutor.corrections[k]);
});

test('the tutor prompt includes the rules, level, corrections and reply format', () => {
  const p = T.tutorPrompt(pack, { level: 'beginner' }, { corrections: 'off' });
  assert.ok(p.includes(pack.tutor.rules[0]));
  assert.ok(p.includes(pack.tutor.levels.beginner));
  assert.ok(p.includes(pack.tutor.corrections.off));
  assert.ok(!p.includes(pack.tutor.corrections.live));
  assert.ok(p.includes('"en":') && p.includes('"he":') && p.includes('"struggled"'));
  assert.ok(p.includes('Nothing is known yet'));
});

test('unknown or missing settings fall back to the defaults', () => {
  const p = T.tutorPrompt(pack);
  assert.ok(p.includes(pack.tutor.levels.intermediate));
  assert.ok(p.includes(pack.tutor.corrections.live));
});

test('the tutor is told about the newest flagged words and weak spots', () => {
  const words = Array.from({ length: 30 }, (_, i) => ({ w: 'word' + i, m: 'מילה' }));
  const p = T.tutorPrompt(pack, { words, weakSpots: ['past tense'] });
  assert.ok(p.includes('word29 (מילה)'));
  assert.ok(p.includes('word10'));
  assert.ok(!p.includes('word9 '));
  assert.ok(p.includes('past tense'));
  assert.ok(!p.includes('Nothing is known yet'));
});

test('a reply is read into the shared shape', () => {
  const text = 'Sure! ```json\n{"sentences":[{"en":"Do you like ships?","he":"אתה אוהב ספינות?","words":[{"w":"like","d":"to like","m":"לֶאֱהוֹב"},{"w":"ships","d":"ship","m":"סְפִינָה"}]}],"struggled":[{"w":"ship","m":"ספינה"}]}\n```';
  const r = T.parseReply(pack, text);
  assert.deepEqual(r, {
    sentences: [{ target: 'Do you like ships?', native: 'אתה אוהב ספינות?', words: [{ w: 'like', d: 'to like', m: 'לֶאֱהוֹב' }, { w: 'ships', d: 'ship', m: 'סְפִינָה' }] }],
    struggled: [{ w: 'ship', d: 'ship', m: 'ספינה' }], // a missing dictionary form falls back to the word as written
  });
});

test('missing parts of a reply are tolerated, empty sentences are dropped', () => {
  const r = T.parseReply(pack, '{"sentences":[{"en":"Hi."},{"he":"רק עברית"},{"en":"  "},{"en":"Ok?","words":[{"m":"no word"},"bad"]}]}');
  assert.deepEqual(r.sentences, [{ target: 'Hi.', native: '', words: [] }, { target: 'Ok?', native: '', words: [] }]);
  assert.deepEqual(r.struggled, []);
});

test('replies with nothing to say are refused', () => {
  assert.throws(() => T.parseReply(pack, 'no json here'), /expected format/);
  assert.throws(() => T.parseReply(pack, '{"sentences": [}'), /broken/);
  assert.throws(() => T.parseReply(pack, '{"sentences":[]}'), /empty/);
});

test('a reply survives the round trip into the conversation history', () => {
  const r = T.parseReply(pack, '{"sentences":[{"en":"Hi.","he":"היי.","words":[{"w":"Hi","d":"hi","m":"היי"}]}]}');
  assert.deepEqual(T.parseReply(pack, T.replyToHistory(pack, r)), r);
});

test('How do I say it: prompt and reply', () => {
  assert.ok(T.howDoISayPrompt(pack).includes('"phrase"'));
  assert.equal(T.parsePhrase('{"phrase":" I would like a coffee "}'), 'I would like a coffee');
  assert.throws(() => T.parsePhrase('{"phrase":""}'), /empty/);
});

test('the reply format asks for dictionary forms and phrases', () => {
  const p = T.tutorPrompt(pack);
  assert.ok(p.includes('"d":"its dictionary form"'));
  assert.ok(p.includes(pack.tutor.dictionaryForm));
  assert.ok(p.includes('phrasal verb'));
});

test('words and phrases are marked in the sentence', () => {
  const words = [{ w: 'up', d: 'up', m: '' }, { w: 'gave up', d: 'gave up', m: 'וִיתֵּר' }, { w: 'cigarettes', d: 'cigarette', m: 'סִיגַרְיָה' }];
  const parts = T.markWords('I gave up cigarettes. Cup up!', words);
  assert.deepEqual(parts.map(p => p.word ? '[' + p.text + ']' : p.text).join(''), 'I [gave up] [cigarettes]. Cup [up]!');
  assert.equal(parts[1].word.d, 'gave up');
  assert.deepEqual(T.markWords('Gave Up.', words).map(p => p.text), ['Gave Up', '.']); // any letter case
  assert.deepEqual(T.markWords('No words here.', []), [{ text: 'No words here.' }]);
});

test('the reply format shows a worked example, and the example follows its own rules', () => {
  assert.ok(T.tutorPrompt(pack).includes(JSON.stringify(pack.tutor.example)));
  const r = T.parseReply(pack, JSON.stringify({ sentences: [pack.tutor.example] }));
  const marked = T.markWords(r.sentences[0].target, r.sentences[0].words).filter(p => p.word).map(p => p.text);
  assert.deepEqual(marked, pack.tutor.example.words.map(x => x.w)); // every word is found in the sentence, in order
});

test('a phrasal verb the AI split in two is joined back into one phrase', () => {
  const P = pack.target.particles;
  const r = T.parseReply(pack, JSON.stringify({ sentences: [{ en: 'You gave up coffee, so why not give it up again?', he: '', words: [
    { w: 'gave', d: 'gave', m: 'וִיתַּרְתָּ' }, { w: 'up', d: 'up', m: 'וִיתַּרְתָּ' }, { w: 'coffee', d: 'coffee', m: 'קָפֶה' }, { w: 'give', d: 'to give', m: 'לְוַתֵּר' }] }] }));
  const words = r.sentences[0].words;
  assert.deepEqual(words.map(x => x.w), ['gave', 'coffee', 'give', 'gave up']); // "up" with the meaning of "gave" is gone
  assert.deepEqual(words[3], { w: 'gave up', d: 'gave up', m: 'וִיתַּרְתָּ' });
  const marked = T.markWords(r.sentences[0].target, words).filter(p => p.word).map(p => p.text);
  assert.deepEqual(marked, ['gave up', 'coffee', 'give']);

  const split = T.joinSplitPhrases('Give it up!', [{ w: 'Give', d: 'to give', m: 'לְוַתֵּר' }, { w: 'up', d: 'up', m: 'לְוַתֵּר' }], P);
  assert.deepEqual(split, [{ w: 'Give', d: 'to give', m: 'לְוַתֵּר' }, { w: 'Give it up', d: 'to give up', m: 'לְוַתֵּר' }]);
  assert.deepEqual(T.markWords('Give it up!', split).filter(p => p.word).map(p => p.text), ['Give it up']);
});

test('a particle with its own meaning is left alone', () => {
  const words = [{ w: 'looked', d: 'looked', m: 'הִסְתַּכֵּל' }, { w: 'up', d: 'up', m: 'לְמַעְלָה' }];
  assert.deepEqual(T.joinSplitPhrases('She looked up at the sky.', words, pack.target.particles), words);
  const far = [{ w: 'gave', d: 'gave', m: 'נָתַן' }, { w: 'up', d: 'up', m: 'נָתַן' }];
  assert.deepEqual(T.joinSplitPhrases('I gave my old red bike up.', far, pack.target.particles), far); // more than 3 words apart
});
