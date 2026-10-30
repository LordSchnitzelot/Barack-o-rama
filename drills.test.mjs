/* Automated tests for drills.js. Run with:  node --test
   Uses small made-up sample data, not real dictionary content. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from './drills.js';

/* A fixed random number generator, so every run picks the same drills. */
function seeded(seed = 1) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const always = v => () => v;
const clock = (t = 1_000_000) => { const c = () => c.t; c.t = t; return c; };

const sample = () => ({
  target: 'en', native: 'he',
  dicts: {
    en: {
      1: [{ text: 'dog', rank: 2 }],
      2: [{ text: 'big', rank: 5 }, { text: 'large', rank: 50 }],
      3: [{ text: 'bat (animal)', rank: 40 }],
      4: [{ text: 'bat (sports)', rank: 41 }],
      5: [{ text: 'went', rank: 10 }],
      6: [{ text: 'to go', rank: 12 }],
      7: [{ text: 'book', rank: 8 }],
      8: [{ text: 'these', rank: 3 }, { text: 'those', rank: 20 }],
      9: [{ text: 'read (past tense)', rank: 30, sayAs: 'red' }],
    },
    he: {
      1: [{ text: 'כֶּלֶב', rank: 2 }],
      2: [{ text: 'גָּדוֹל', rank: 5, forms: ['גְּדוֹלָה', 'גְּדוֹלִים', 'גְּדוֹלוֹת'] }],
      3: [{ text: 'עֲטַלֵּף', rank: 40 }],
      4: [{ text: 'אַלָּה', rank: 41 }],
      5: [{ text: 'הָלַךְ', rank: 10, forms: ['הָלְכָה', 'הָלַכְתִּי', 'הָלַכְתָּ', 'הָלְכוּ'] }],
      6: [{ text: 'לָלֶכֶת', rank: 12 }],
      7: [{ text: 'סֵפֶר', rank: 8 }],
      8: [{ text: 'אֵלֶּה', rank: 3 }],
      9: [{ text: 'קָרָא', rank: 30 }],
    },
  },
  sentences: [
    { id: 'en1', lang: 'en', text: 'The dog is big.', difficulty: 1, tags: [{ group: '1', word: 0 }, { group: '2', word: 0 }] },
    { id: 'he1', lang: 'he', text: 'הַכֶּלֶב גָּדוֹל.', difficulty: 1, tags: [{ group: '1', word: 0 }, { group: '2', word: 0 }] },
    { id: 'en2', lang: 'en', text: 'These dogs went.', difficulty: 2, tags: [{ group: '8', word: 0 }, { group: '1', word: 0 }, { group: '5', word: 0 }] },
  ],
});
const fresh = () => ({ progress: {} });
const ref = (group, word = 0) => ({ group: String(group), word });

/* ---------- Normalization ---------- */

test('normalize: lowercase, punctuation and nikkud removed', () => {
  assert.equal(D.normalize('Big!'), 'big');
  assert.equal(D.normalize('  Hello,   WORLD?? '), 'hello world');
  assert.equal(D.normalize("Don't."), 'dont');
  assert.equal(D.normalize('הָלַךְ'), 'הלך');
  assert.equal(D.normalize('עֲטַלֵּף'), 'עטלף');
  assert.equal(D.normalize('בֵּית־סֵפֶר'), 'בית ספר'); // maqaf becomes a space
  assert.equal(D.normalize('שׁלוֹם'), 'שלום'); // ready-made pointed shin
  assert.equal(D.normalize('צה״ל'), 'צהל');
  assert.equal(D.normalize('ice-cream'), 'ice cream');
});

test('stripLabel and spokenText', () => {
  assert.equal(D.stripLabel('bat (sports)'), 'bat');
  assert.equal(D.stripLabel('know (a person)'), 'know');
  assert.equal(D.spokenText({ text: 'read (past tense)', sayAs: 'red' }), 'red');
  assert.equal(D.spokenText({ text: 'bat (sports)' }), 'bat (sports)'); // labels are spoken as written
});

/* ---------- Word answers ---------- */

test('word answers: labels, synonyms, accepted forms', () => {
  const d = sample();
  const en = (g, w = 0) => ({ lang: 'en', group: String(g), word: w });
  const he = (g, w = 0) => ({ lang: 'he', group: String(g), word: w });
  assert.equal(D.checkWordAnswer(d, en(4), 'אלה').result, 'right');
  assert.equal(D.checkWordAnswer(d, en(4), 'עטלף').result, 'wrong'); // the other "bat"
  assert.equal(D.checkWordAnswer(d, en(3), 'עֲטַלֵּף').result, 'right');
  assert.equal(D.checkWordAnswer(d, he(4), 'bat').result, 'right'); // label not needed
  assert.deepEqual(D.checkWordAnswer(d, he(2), 'Large.').matched, ref(2, 1));
  assert.equal(D.checkWordAnswer(d, en(2, 1), 'גדולות').result, 'right'); // any gender and number
  assert.equal(D.checkWordAnswer(d, en(5), 'הלכתי').result, 'right'); // any person
});

test('word answers: the two verb forms are separate', () => {
  const d = sample();
  const he = g => ({ lang: 'he', group: String(g), word: 0 });
  assert.equal(D.checkWordAnswer(d, he(5), 'went').result, 'right');
  assert.equal(D.checkWordAnswer(d, he(5), 'go').result, 'wrong');
  assert.equal(D.checkWordAnswer(d, he(5), 'to go').result, 'wrong');
  assert.equal(D.checkWordAnswer(d, he(6), 'to go').result, 'right');
  assert.equal(D.checkWordAnswer(d, he(6), 'go').result, 'right');
});

test('word answers: articles (default choice) and near misses', () => {
  const d = sample();
  const he = g => ({ lang: 'he', group: String(g), word: 0 });
  assert.equal(D.checkWordAnswer(d, he(7), 'the book').result, 'right');
  assert.equal(D.checkWordAnswer(d, he(7), 'a book').result, 'right');
  assert.equal(D.checkWordAnswer(d, { lang: 'en', group: '7', word: 0 }, 'הספר').result, 'maybe'); // ה not removed: one letter off
  const near = D.checkWordAnswer(d, he(1), 'dag');
  assert.equal(near.result, 'maybe');
  assert.equal(near.closest, 'dog');
  assert.equal(D.checkWordAnswer(d, he(1), 'elephant').result, 'wrong');
  assert.equal(D.checkWordAnswer(d, he(1), '').result, 'wrong');
});

/* ---------- Spaced repetition ---------- */

test('spaced repetition: right answers wait longer, a wrong one comes back at once', () => {
  const r = D.newRecord(0);
  D.review(r, true, 0);
  assert.equal(r.due, D.INTERVALS[1]);
  D.review(r, true, 0);
  D.review(r, true, 0);
  assert.equal(r.level, 3);
  assert.equal(r.due, 3 * D.DAY);
  D.review(r, false, 100);
  assert.equal(r.level, 0);
  assert.equal(r.due, 100);
  assert.equal(r.weak, true);
});

test('spaced repetition: weak until right twice in a row; never retired', () => {
  const r = D.newRecord(0);
  D.review(r, false, 0);
  D.review(r, true, 0);
  assert.equal(r.weak, true);
  D.review(r, true, 0);
  assert.equal(r.weak, false);
  for (let i = 0; i < 20; i++) D.review(r, true, 0);
  assert.equal(r.level, D.INTERVALS.length - 1);
  assert.equal(r.due, 60 * D.DAY); // still comes back, every 60 days
});

test('progress is kept per word and per direction', () => {
  const d = sample(), p = fresh(), now = clock();
  const s = D.startSession(d, p, { mode: 'comprehension', size: 1, rng: always(0.9), now });
  const dr = D.nextDrill(s);
  D.recordAnswer(s, dr, { correct: false });
  assert.equal(D.getRecord(p, dr.item, 'understand').weak, true);
  assert.equal(D.getRecord(p, dr.item, 'say'), null);
  assert.equal(D.getRecord(p, ref(2, 1), 'understand'), null); // "large" untouched when "big" is missed
});

test('flagWord: source picks the direction', () => {
  const p = fresh();
  D.flagWord(p, ref(7), 'tapped', 5);
  D.flagWord(p, ref(1), 'how-do-I-say-it', 5);
  assert.equal(D.getRecord(p, ref(7), 'understand').weak, true);
  assert.equal(D.getRecord(p, ref(7), 'say'), null);
  assert.equal(D.getRecord(p, ref(1), 'say').weak, true);
  assert.equal(D.getRecord(p, ref(1), 'say').flags[0].source, 'how-do-I-say-it');
});

/* ---------- Item selection mix ---------- */

/* 30 made-up words: 10 weak, 10 known and due, 10 never seen. */
function bigSetup() {
  const d = { target: 'en', native: 'he', dicts: { en: {}, he: {} }, sentences: [] };
  for (let i = 0; i < 30; i++) {
    d.dicts.en[i + 1] = [{ text: 'word' + i, rank: i }];
    d.dicts.he[i + 1] = [{ text: 'מילה' + i, rank: i }];
  }
  const p = fresh(), now = clock();
  for (let i = 0; i < 20; i++)
    for (const dir of ['understand', 'say']) {
      const r = D.newRecord(0);
      D.review(r, true, 0);
      if (i < 10) D.review(r, false, 0); // weak
      p.progress[i + 1 + ':0'] = { ...(p.progress[i + 1 + ':0'] || {}), [dir]: r };
    }
  now.t = 2 * D.DAY; // the known words are due
  return { d, p, now };
}

test('selection mix: 4 new, 4 weak, 2 known in a session of 10', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { d, p, now } = bigSetup();
    const s = D.startSession(d, p, { mode: 'words', rng: seeded(seed), now });
    const count = { new: 0, weak: 0, known: 0 };
    let dr;
    while ((dr = D.nextDrill(s))) count[dr.bucket]++;
    assert.deepEqual(count, { new: 4, weak: 4, known: 2 }, 'seed ' + seed);
  }
});

test('selection mix: known words come up only when due', () => {
  const { d, p, now } = bigSetup();
  now.t = 1; // nothing known is due yet
  const s = D.startSession(d, p, { mode: 'words', rng: seeded(3), now });
  let dr;
  while ((dr = D.nextDrill(s))) assert.notEqual(dr.bucket, 'known');
  assert.equal(s.history.length, 10); // the session is still full
});

test('selection mix: an empty bucket is filled from the others', () => {
  const d = sample(), p = fresh(), now = clock();
  const s = D.startSession(d, p, { mode: 'words', size: 5, rng: seeded(2), now });
  const got = [];
  let dr;
  while ((dr = D.nextDrill(s))) { got.push(dr.bucket); D.recordAnswer(s, dr, { correct: true }); }
  assert.deepEqual(got, ['new', 'new', 'new', 'new', 'new']);
});

test('new words come most common first, with an occasional less common one', () => {
  const d = sample();
  let s = D.startSession(d, fresh(), { mode: 'comprehension', rng: always(0.9), now: clock() });
  assert.equal(D.nextDrill(s).prompt.text, 'dog'); // rank 2
  s = D.startSession(d, fresh(), { mode: 'comprehension', rng: always(0), now: clock() });
  assert.equal(D.nextDrill(s).prompt.text, 'these'); // skipped ahead to the next one
});

test('a word seen for the first time gets an intro', () => {
  const d = sample(), p = fresh();
  const s = D.startSession(d, p, { mode: 'comprehension', rng: always(0.9), now: clock() });
  const first = D.nextDrill(s);
  assert.equal(first.intro, true);
  D.recordAnswer(s, first, { correct: true });
  const s2 = D.startSession(d, p, { mode: 'speaking', rng: always(0.9), now: clock() });
  const again = D.nextDrill(s2);
  assert.deepEqual(again.item, first.item); // new in the speaking direction...
  assert.equal(again.intro, false); // ...but already introduced
});

/* ---------- Next-drill algorithm ---------- */

test('modes: comprehension and speaking pick the direction and prompt language', () => {
  const d = sample();
  let s = D.startSession(d, fresh(), { mode: 'comprehension', rng: seeded(4), now: clock() });
  let dr;
  while ((dr = D.nextDrill(s))) { assert.equal(dr.dir, 'understand'); assert.equal(dr.prompt.lang, 'en'); D.recordAnswer(s, dr, { correct: true }); }
  s = D.startSession(d, fresh(), { mode: 'speaking', rng: seeded(4), now: clock() });
  while ((dr = D.nextDrill(s))) { assert.equal(dr.dir, 'say'); assert.equal(dr.prompt.lang, 'he'); D.recordAnswer(s, dr, { correct: true }); }
});

test('mixed: comprehension and speaking come up about equally', () => {
  const n = { understand: 0, say: 0 }, rng = seeded(7);
  for (let i = 0; i < 200; i++) {
    const { d, p, now } = bigSetup();
    const s = D.startSession(d, p, { rng, now });
    n[D.nextDrill(s).dir]++;
  }
  assert.ok(Math.abs(n.understand - n.say) < 40, JSON.stringify(n));
});

test('the same word is not asked again within 3 drills', () => {
  const { d, p, now } = bigSetup();
  const s = D.startSession(d, p, { mode: 'words', size: 10, rng: seeded(5), now });
  const keys = [];
  let dr;
  while ((dr = D.nextDrill(s))) { keys.push(D.wordKey(dr.item)); D.recordAnswer(s, dr, { correct: false }); }
  for (let i = 0; i < keys.length; i++) assert.ok(!keys.slice(Math.max(0, i - 3), i).includes(keys[i]), keys.join(' '));
});

test('the session ends after its size', () => {
  const { d, p, now } = bigSetup();
  const s = D.startSession(d, p, { size: 3, rng: seeded(1), now });
  assert.ok(D.nextDrill(s) && D.nextDrill(s) && D.nextDrill(s));
  assert.equal(D.nextDrill(s), null);
});

test('speaking prompt uses the "say as" text only for the voice', () => {
  const d = sample(), p = fresh();
  const later = () => ({ understand: { ...D.newRecord(0), due: 9e15 } }); // seen, not due
  for (const g of ['1', '2', '8', '5', '6', '7', '3', '4']) p.progress[g + ':0'] = later();
  p.progress['2:1'] = later();
  p.progress['8:1'] = later();
  const s = D.startSession(d, p, { mode: 'comprehension', rng: always(0.9), now: clock() });
  const dr = D.nextDrill(s);
  assert.equal(dr.prompt.text, 'read (past tense)');
  assert.equal(dr.prompt.speak, 'red');
});

/* ---------- Progression from words to sentences ---------- */

test('progression: a new word is tested alone first', () => {
  const d = sample();
  const s = D.startSession(d, fresh(), { mode: 'sentences', rng: seeded(1), now: clock() });
  const dr = D.nextDrill(s);
  assert.equal(dr.type, 'word'); // no sentence fits yet, so a word drill is used
  assert.equal(dr.bucket, 'new');
});

test('progression: sentences once every word in them is ready', () => {
  const d = sample(), p = fresh(), now = clock();
  const dog = ref(1), big = ref(2);
  const r = D.review(D.newRecord(0), true, 0);
  p.progress['1:0'] = { understand: { ...r } };
  let s = D.startSession(d, p, { mode: 'sentences', rng: seeded(1), now });
  assert.equal(D.sentencesFor(s, dog, 'understand').length, 0); // "big" not ready yet
  p.progress['2:0'] = { understand: { ...r } };
  s = D.startSession(d, p, { mode: 'sentences', rng: seeded(1), now });
  assert.deepEqual(D.sentencesFor(s, dog, 'understand').map(x => x.id), ['en1']);
  assert.deepEqual(D.sentencesFor(s, big, 'say').map(x => x.id), ['he1']); // ready in either direction counts
});

test('progression: a right sentence credits every word in it; a hint does not', () => {
  const d = sample(), p = fresh(), now = clock(2 * D.DAY);
  for (const k of ['1:0', '2:0', '8:0', '5:0']) p.progress[k] = { understand: D.review(D.newRecord(0), true, 0) };
  const s = D.startSession(d, p, { mode: 'sentences', size: 1, rng: always(0.1), now }); // 0.1: comprehension
  const dr = D.nextDrill(s);
  assert.equal(dr.type, 'sentence');
  assert.equal(dr.sentence.lang, 'en');
  const others = dr.sentence.tags.map(t => t.group + ':' + t.word).filter(k => k !== D.wordKey(dr.item));
  const hinted = dr.sentence.tags.filter(t => t.group + ':' + t.word === others[0]);
  D.recordAnswer(s, dr, { correct: true, hinted });
  assert.equal(D.getRecord(p, dr.item, 'understand').level, 2);
  const [h, ...rest] = others;
  assert.equal(p.progress[h].understand.weak, true); // needed a hint
  for (const k of rest) assert.equal(p.progress[k].understand.level, 2);
});

test('progression: a wrong sentence only counts against the drilled word', () => {
  const d = sample(), p = fresh(), now = clock(2 * D.DAY);
  for (const k of ['1:0', '2:0']) p.progress[k] = { understand: D.review(D.newRecord(0), true, 0) };
  const s = D.startSession(d, p, { mode: 'sentences', size: 1, rng: always(0.1), now });
  const dr = D.nextDrill(s);
  assert.equal(dr.sentence.id, 'en1');
  D.recordAnswer(s, dr, { correct: false });
  const other = dr.item.group === '1' ? '2:0' : '1:0';
  assert.equal(D.getRecord(p, dr.item, 'understand').weak, true);
  assert.equal(p.progress[other].understand.weak, false);
  assert.equal(p.progress[other].understand.level, 1);
});

test('progression: a Hebrew sentence credits the English words already started', () => {
  const d = sample(), p = fresh(), now = clock(2 * D.DAY);
  p.progress['1:0'] = { say: D.review(D.newRecord(0), true, 0) };
  p.progress['2:0'] = { say: D.review(D.newRecord(0), true, 0) }; // "big" started, "large" not
  const s = D.startSession(d, p, { mode: 'sentences', size: 1, rng: always(0.9), now });
  const dr = D.nextDrill(s);
  assert.equal(dr.sentence.id, 'he1');
  assert.equal(dr.prompt.lang, 'he');
  D.recordAnswer(s, dr, { correct: true });
  assert.equal(p.progress['1:0'].say.level, 2);
  assert.equal(p.progress['2:0'].say.level, 2);
  assert.equal(p.progress['2:1'], undefined);
});

test('word drill: saying a synonym also credits the synonym', () => {
  const d = sample(), p = fresh(), now = clock();
  p.progress['2:0'] = { say: { ...D.newRecord(0), right: 1, level: 1 } };
  const s = D.startSession(d, p, { mode: 'speaking', size: 1, rng: always(0.9), now });
  const dr = { type: 'word', dir: 'say', bucket: 'known', item: ref(2, 0), prompt: { lang: 'he', group: '2', word: 0 } };
  const c = D.checkWordAnswer(d, dr.prompt, 'large');
  D.recordAnswer(s, dr, { correct: c.result === 'right', matched: c.matched });
  assert.equal(p.progress['2:0'].say.level, 2);
  assert.equal(p.progress['2:1'].say.level, 1);
});
