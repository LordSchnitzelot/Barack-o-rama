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
  const text = 'Sure! ```json\n{"sentences":[{"en":"Do you like ships?","he":"אתה אוהב ספינות?","words":[{"w":"like","m":"אוהב"},{"w":"ships","m":"ספינות"}]}],"struggled":[{"w":"ship","m":"ספינה"}]}\n```';
  const r = T.parseReply(pack, text);
  assert.deepEqual(r, {
    sentences: [{ target: 'Do you like ships?', native: 'אתה אוהב ספינות?', words: [{ w: 'like', m: 'אוהב' }, { w: 'ships', m: 'ספינות' }] }],
    struggled: [{ w: 'ship', m: 'ספינה' }],
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
  const r = T.parseReply(pack, '{"sentences":[{"en":"Hi.","he":"היי.","words":[{"w":"Hi","m":"היי"}]}]}');
  assert.deepEqual(T.parseReply(pack, T.replyToHistory(pack, r)), r);
});

test('How do I say it: prompt and reply', () => {
  assert.ok(T.howDoISayPrompt(pack).includes('"phrase"'));
  assert.equal(T.parsePhrase('{"phrase":" I would like a coffee "}'), 'I would like a coffee');
  assert.throws(() => T.parsePhrase('{"phrase":""}'), /empty/);
});
