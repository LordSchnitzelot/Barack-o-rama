/* Drills logic (spec sections 3.3, 6 and 8), as plain code with no AI and no screen.
   A plain JavaScript module with no build step: the page can load it with
   <script type="module">, and Node runs its tests (drills.test.mjs).
   Not connected to index.html yet.

   Where the spec leaves a question open, the simple choice made here is marked
   "DEFAULT (open question)" so it is easy to find and change.

   Data shapes (illustrative; real dictionaries follow spec 3.3). Group IDs are only labels:
   any text or number works, as long as paired English and Hebrew groups share one.
     data = {
       target: 'en', native: 'he',
       dicts: {                       // one dictionary per language, groups by shared ID
         en: { '2': [ { text: 'big', rank: 30, forms: [] }, { text: 'large', rank: 300 } ] },
         he: { '2': [ { text: 'גָּדוֹל', rank: 25, forms: ['גְּדוֹלָה', 'גְּדוֹלִים', 'גְּדוֹלוֹת'] } ] },
       },
       sentences: [ { id: 's1', lang: 'en', text: 'The dog is big.', difficulty: 1,
                      tags: [ { group: '1', word: 0 }, { group: '2', word: 0 } ] } ],
     }
   A word is referred to as { group, word }: the group ID and the word's index inside it.
   Progress is stored per target-language word, per direction:
     profile = { progress: { '2:0': { understand: Record, say: Record } } }
   "understand" is hearing the target language and answering in the native one;
   "say" is hearing the native language and answering in the target one. */

export const MIN = 60 * 1000, DAY = 24 * 60 * MIN;

/* ---------- Answer normalization (spec 3.3, Word answers) ---------- */

/* Hebrew vowel points and cantillation marks. Leaves out the Hebrew punctuation in the same
   Unicode block (maqaf, paseq, sof pasuq, nun hafukha), which is handled as punctuation. */
const NIKKUD = /[֑-ׇֽֿׁׂׅׄ]/g;

/* Lowercase, remove punctuation and nikkud, and tidy spaces. Apostrophes and Hebrew
   geresh/gershayim are dropped without a space ("don't" -> "dont", צה״ל -> צהל); other
   punctuation, including hyphens and the maqaf, becomes a space. */
export function normalize(text) {
  return String(text)
    .normalize('NFD') // splits ready-made pointed letters (such as שׁ) into letter + point
    .replace(NIKKUD, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/['’‘`׳״"]/g, '')
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* "bat (sports)" -> "bat". Labels are shown and spoken, but never part of an answer. */
export const stripLabel = text => String(text).replace(/\s*\([^)]*\)/g, '').trim();

/* The text to send to the voice: the "say as" respelling if the entry has one. */
export const spokenText = entry => entry.sayAs || entry.text;

/* DEFAULT (open question: articles in answers): a leading "a", "an" or "the" is ignored in
   English answers, so "the book" counts for "book". A leading Hebrew ה is NOT removed,
   because it is also the first letter of many words (הָלַךְ). */
function dropArticle(t, lang) {
  return lang === 'en' ? t.replace(/^(a|an|the) /, '') : t;
}

/* Every normalized answer accepted for one entry: the word without its label, plus its
   listed forms. An English infinitive "to go" also accepts "go" (spec 3.3, Verbs). */
export function acceptedForms(entry, lang) {
  const out = new Set();
  for (const f of [stripLabel(entry.text), ...(entry.forms || [])]) {
    const n = dropArticle(normalize(f), lang);
    if (!n) continue;
    out.add(n);
    if (lang === 'en' && n.startsWith('to ')) out.add(n.slice(3));
  }
  return [...out];
}

function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/* Checks a spoken word answer by code (spec 6.2). The prompt is a word in promptLang; the
   answer is right if it matches any accepted form of any word in the paired group.
   Returns { result: 'right' | 'maybe' | 'wrong', matched, closest }:
     matched  the { group, word } that was said, when right
     closest  for 'maybe', the text to offer in "Did you mean...?" (spec 6.7)
   DEFAULT (open question: no match in the stored list): no AI fallback. A near miss
   (a few letters off) goes to "Did you mean...?"; anything else is wrong. */
export function checkWordAnswer(data, prompt, answer) {
  const lang = prompt.lang === data.target ? data.native : data.target;
  const group = data.dicts[lang][prompt.group] || [];
  const said = dropArticle(normalize(answer), lang);
  let best = null;
  for (let i = 0; i < group.length; i++) {
    for (const f of acceptedForms(group[i], lang)) {
      if (f === said) return { result: 'right', matched: { group: prompt.group, word: i }, closest: null };
      const dist = editDistance(said, f);
      if (!best || dist < best.dist) best = { dist, text: stripLabel(group[i].text) };
    }
  }
  /* DEFAULT: "a few letters" means at most 1 edit, or 1 per 4 letters for longer words. */
  if (best && said && best.dist <= Math.max(1, Math.floor(said.length / 4)))
    return { result: 'maybe', matched: null, closest: best.text };
  return { result: 'wrong', matched: null, closest: null };
}

/* ---------- Spaced repetition (spec 8): per word and per direction ---------- */

/* DEFAULT: how long to wait before the next review, by level. A wrong answer goes back to
   level 0 (due again at once, so it comes back soon). The last step repeats forever, so a
   word that is always right still gets a rare check and is never retired (spec 6.5). */
export const INTERVALS = [0, 10 * MIN, DAY, 3 * DAY, 7 * DAY, 21 * DAY, 60 * DAY];
/* DEFAULT: a weak word stops being weak after this many right answers in a row. */
export const WEAK_EXIT_STREAK = 2;

export const wordKey = ref => ref.group + ':' + ref.word;

export function newRecord(now) {
  return { level: 0, due: now, streak: 0, right: 0, wrong: 0, weak: false, flags: [], modified: now };
}

export function getRecord(profile, ref, dir) {
  return (profile.progress[wordKey(ref)] || {})[dir] || null;
}

function ensureRecord(profile, ref, dir, now) {
  const p = (profile.progress[wordKey(ref)] ||= {});
  return (p[dir] ||= newRecord(now));
}

/* Updates one word in one direction after an answer. */
export function review(record, correct, now) {
  if (correct) {
    record.level = Math.min(record.level + 1, INTERVALS.length - 1);
    record.streak++;
    record.right++;
    if (record.streak >= WEAK_EXIT_STREAK) record.weak = false;
  } else {
    record.level = 0;
    record.streak = 0;
    record.wrong++;
    record.weak = true; // "add the gap to the profile" (spec 6.7)
  }
  record.due = now + INTERVALS[record.level];
  record.modified = now;
  return record;
}

/* Flags a word from Chat or Guide (spec 6.4, 8). source: 'tapped' or 'model-detected'
   point at understanding; 'how-do-I-say-it' at speaking.
   DEFAULT: those sources pick the direction; any other source flags both. */
export function flagWord(profile, ref, source, now) {
  const dirs = source === 'how-do-I-say-it' ? ['say'] : /^(tapped|model-detected)$/.test(source) ? ['understand'] : ['understand', 'say'];
  for (const dir of dirs) {
    const r = ensureRecord(profile, ref, dir, now);
    r.weak = true;
    r.streak = 0;
    r.due = now;
    r.flags.push({ source, time: now });
    r.modified = now;
  }
}

/* ---------- Word states ---------- */

/* A word is "ready for sentences" once it was answered right at least once, in either
   direction (spec 6.5: a new word is tested alone first). */
export function isReady(profile, ref) {
  const p = profile.progress[wordKey(ref)];
  return !!p && ((p.understand && p.understand.right > 0) || (p.say && p.say.right > 0));
}

export function targetWords(data) {
  const out = [];
  for (const [group, words] of Object.entries(data.dicts[data.target]))
    words.forEach((e, word) => out.push({ group, word, rank: e.rank ?? Infinity }));
  return out.sort((a, b) => a.rank - b.rank);
}

/* ---------- Choosing the next drill (spec 6.3, 6.4, 6.5) ---------- */

/* Starting values from spec 6.4. */
export const MIX = { new: 0.4, weak: 0.4, known: 0.2 };
export const SESSION_SIZE = 10;
/* DEFAULT: how often a new word skips ahead to a less common one, and how far. */
export const RARE_NEW_CHANCE = 0.15, RARE_NEW_WINDOW = 20;
/* DEFAULT: in Mixed, how often a sentence is used when one fits. */
export const SENTENCE_CHANCE = 0.5;
/* DEFAULT: the same word is not asked again within this many drills. */
export const REPEAT_GAP = 3;

export const MODES = ['mixed', 'words', 'sentences', 'comprehension', 'speaking'];

/* rng: a function returning numbers in [0, 1), like Math.random (tests pass a fixed one).
   now: a function returning the time in milliseconds. */
export function startSession(data, profile, { mode = 'mixed', size = SESSION_SIZE, rng = Math.random, now = Date.now } = {}) {
  if (!MODES.includes(mode)) throw new Error('Unknown mode: ' + mode);
  const quota = { new: Math.round(size * MIX.new), weak: Math.round(size * MIX.weak) };
  quota.known = size - quota.new - quota.weak;
  return { data, profile, mode, size, rng, now, quota, used: { new: 0, weak: 0, known: 0 }, history: [] };
}

const pick = (list, rng) => list[Math.floor(rng() * list.length)];

function recentKeys(s) {
  return new Set(s.history.slice(-REPEAT_GAP).map(d => wordKey(d.item)));
}

/* Words in each bucket for one direction, best first. */
export function candidates(s, dir) {
  const { data, profile } = s, t = s.now(), recent = recentKeys(s);
  const all = targetWords(data).filter(w => !recent.has(wordKey(w)));
  const fresh = [], weak = [], known = [];
  for (const w of all) {
    const r = getRecord(profile, w, dir);
    if (!r) fresh.push(w);
    else if (r.weak) weak.push(w); // weak words come up whether due or not, until fixed
    else if (r.due <= t) known.push(w);
  }
  const lvl = w => getRecord(profile, w, dir);
  weak.sort((a, b) => lvl(a).level - lvl(b).level || lvl(a).due - lvl(b).due);
  known.sort((a, b) => lvl(a).due - lvl(b).due); // most overdue first
  return { new: fresh, weak, known };
}

function pickNew(list, rng) {
  if (list.length > 1 && rng() < RARE_NEW_CHANCE) return list[1 + Math.floor(rng() * Math.min(RARE_NEW_WINDOW, list.length - 1))];
  return list[0];
}

/* The target-language words that a sentence tag stands for: the word itself for a
   target-language sentence; for a native-language sentence, the words of the paired group. */
function tagTargets(data, sentence, tag) {
  if (sentence.lang === data.target) return [{ group: tag.group, word: tag.word }];
  return (data.dicts[data.target][tag.group] || []).map((_, word) => ({ group: tag.group, word }));
}

/* Stored sentences that can drill this word in this direction (spec 6.5): in the right
   language, containing the word, and with every other word already ready. */
export function sentencesFor(s, ref, dir) {
  const { data, profile } = s;
  const lang = dir === 'understand' ? data.target : data.native;
  const asked = new Set(s.history.filter(d => d.sentence).map(d => d.sentence.id));
  return data.sentences
    .filter(x => x.lang === lang && !asked.has(x.id))
    .filter(x => x.tags.some(tag => tagTargets(data, x, tag).some(r => wordKey(r) === wordKey(ref))))
    .filter(x => x.tags.every(tag => tagTargets(data, x, tag).some(r => isReady(profile, r))))
    .sort((a, b) => (a.difficulty ?? 0) - (b.difficulty ?? 0));
}

/* Picks the next drill, or returns null when the session is over.
   Order (spec 6.3): exercise type and direction first, then the item.
   DEFAULT (open question: random or repetitive): the direction is random, 50/50, which
   keeps comprehension and speaking equal (spec 6.1). */
export function nextDrill(s) {
  if (s.history.length >= s.size) return null;
  const { data, profile, rng, mode } = s;
  const dir = mode === 'comprehension' ? 'understand' : mode === 'speaking' ? 'say' : rng() < 0.5 ? 'understand' : 'say';
  const c = candidates(s, dir);
  const wantSentence = mode === 'sentences' || (mode !== 'words' && rng() < SENTENCE_CHANCE);

  /* Buckets still under their quota, weighted by how much quota is left. When the quotas
     are used up or the buckets are empty, any bucket with words is used, so the session
     still has its full length. New words are tested alone first, so they never go
     straight into a sentence. */
  const bucketsFor = sentence => {
    const ok = b => c[b].some(w => !sentence || sentencesFor(s, w, dir).length);
    const open = ['new', 'weak', 'known'].filter(b => (!sentence || b !== 'new') && ok(b));
    const left = open.filter(b => s.used[b] < s.quota[b]);
    return left.length ? left : open;
  };
  let sentence = wantSentence, buckets = bucketsFor(true);
  if (!wantSentence || !buckets.length) { sentence = false; buckets = bucketsFor(false); }
  /* DEFAULT: in "Sentences only", when no sentence fits yet, a word drill is used so new
     words can become ready. */
  if (!buckets.length) return null; // nothing left to drill at all

  const weights = buckets.map(b => Math.max(s.quota[b] - s.used[b], 0) || 1);
  let r = rng() * weights.reduce((a, b) => a + b, 0), bucket = buckets[0];
  for (let i = 0; i < buckets.length; i++) if ((r -= weights[i]) < 0) { bucket = buckets[i]; break; }

  let list = c[bucket];
  if (sentence) list = list.filter(w => sentencesFor(s, w, dir).length);
  const item = bucket === 'new' ? pickNew(list, rng) : list[0];
  const { group, word } = item, ref = { group, word };

  const drill = { type: sentence ? 'sentence' : 'word', dir, bucket, item: ref, intro: false };
  if (sentence) {
    drill.sentence = sentencesFor(s, ref, dir)[0];
    drill.prompt = { lang: drill.sentence.lang, text: drill.sentence.text, speak: drill.sentence.text };
  } else if (dir === 'understand') {
    const e = data.dicts[data.target][group][word];
    drill.prompt = { lang: data.target, group, word, text: e.text, speak: spokenText(e) };
  } else {
    /* DEFAULT: the native-language prompt is a random word from the paired group. */
    const g = data.dicts[data.native][group] || [];
    const w = Math.floor(rng() * g.length), e = g[w];
    drill.prompt = { lang: data.native, group, word: w, text: e.text, speak: spokenText(e) };
  }
  /* A word seen for the first time starts with a short intro (spec 6.4): the user hears it,
     sees the translation and repeats it. */
  drill.intro = bucket === 'new' && !profile.progress[wordKey(ref)];
  s.used[bucket]++;
  s.history.push(drill);
  return drill;
}

/* Saves the outcome of a drill.
   Word drill:     { correct, matched } where matched is checkWordAnswer's matched word.
   Sentence drill: { correct, hinted } where correct comes from the AI meaning check and
                   hinted lists the sentence tags the user tapped for a hint (spec 6.6).
   DEFAULT: in a word drill, a right answer credits the drilled word and also the word
   actually said, if it was a different word of the same group ("large" when asked for
   "big").
   DEFAULT: a word the user needed a hint for counts like a wrong answer for that word, so
   it becomes weak, even if the sentence was right.
   DEFAULT: a wrong sentence counts as wrong only for the drilled word; the other words in
   it are left as they were, since the mistake may not be theirs.
   DEFAULT: a native-language sentence credits, for each tag, the target words of its
   group that the user has already started in that direction. */
export function recordAnswer(s, drill, { correct, matched = null, hinted = [] }) {
  const { data, profile } = s, t = s.now(), dir = drill.dir;
  if (drill.type === 'word') {
    review(ensureRecord(profile, drill.item, dir, t), !!correct, t);
    if (correct && matched && drill.dir === 'say' && wordKey(matched) !== wordKey(drill.item))
      review(ensureRecord(profile, matched, dir, t), true, t);
    return;
  }
  const hintedKeys = new Set(hinted.flatMap(tag => tagTargets(data, drill.sentence, tag).map(wordKey)));
  const done = new Set();
  for (const tag of drill.sentence.tags) {
    for (const ref of tagTargets(data, drill.sentence, tag)) {
      const k = wordKey(ref);
      if (done.has(k)) continue;
      if (!correct && k !== wordKey(drill.item) && !hintedKeys.has(k)) continue;
      const started = getRecord(profile, ref, dir) || k === wordKey(drill.item) || drill.sentence.lang === data.target;
      if (!started) continue;
      done.add(k);
      review(ensureRecord(profile, ref, dir, t), !!correct && !hintedKeys.has(k), t);
    }
  }
}
