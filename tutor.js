/* The tutor (spec 5.11): builds the instructions sent to the AI model from the language pack,
   the learner profile and the settings, and checks the model's replies.
   Plain code with no screen and no network, so Node can test it (tutor.test.mjs).

   profile = {
     level: 'beginner' | 'intermediate' | 'advanced',
     words: [ { w: 'ship', m: 'אוֹנִיָּה' } ],      // flagged and weak words, newest last
     weakSpots: [ 'past tense of irregular verbs' ], // notes from earlier sessions (build step 5)
   }
   settings = { corrections: 'live' | 'end' | 'off' }

   A tutor reply comes back as data (spec 3.2, Structured model replies). The JSON keys are the
   pack's language codes, so for English-for-Hebrew-speakers a sentence is {"en", "he", "words"}.
   parseReply turns it into the same shape for every pack:
     { sentences: [ { target, native, words: [ { w, t, d, m } ] } ], struggled: [ { w, d, m } ] }
   w is the word or phrase as written ("heavier"), t its translation as used in the sentence
   ("כבד יותר"), d its dictionary form ("heavy"; "to run" for "runs") and m its meaning in that same
   form ("כָּבֵד"). The app links d and m to a dictionary entry in
   code (spec 3.2, Linking chat words to the dictionary; see dictionary.js). */
import { t as uiText } from './strings.js';

/* How many flagged words the tutor is told about; the newest ones are kept. */
export const MAX_PROFILE_WORDS = 20;

/* mode: 'chat' (free conversation) or 'guide' (teacher-style lesson with exercises, spec 5.1). */
export function tutorPrompt(pack, profile = {}, settings = {}, mode = 'chat') {
  const T = pack.tutor, t = pack.target;
  const level = T.levels[profile.level] || T.levels.intermediate;
  const corrections = T.corrections[settings.corrections] || T.corrections.live;
  const words = (profile.words || []).slice(-MAX_PROFILE_WORDS);
  const spots = profile.weakSpots || [];
  const lines = [T.role, '', 'How to teach:', ...T.rules.map(r => '- ' + r), '- ' + corrections];
  if (mode === 'guide') {
    const G = pack.guide;
    lines.push('', G.role, 'Exercise types:', ...G.exercises.map(x => `- ${x.name}: ${x.how}`), ...G.rules.map(r => '- ' + r));
  }
  lines.push('', 'The learner:', '- ' + level);
  if (words.length) lines.push(`- Words they are practicing (${t.name}, with meaning). Bring a few of them into the conversation: ` +
    words.map(x => x.m ? `${x.w} (${x.m})` : x.w).join(', ') + '.');
  if (spots.length) lines.push('- Weak spots to work on: ' + spots.join('; ') + '.');
  if (!words.length && !spots.length) lines.push('- Nothing is known yet about their weak spots. Find out by talking.');
  lines.push('', replyFormat(pack));
  return lines.join('\n');
}

function replyFormat(pack) {
  const t = pack.target, n = pack.native;
  return `Reply ONLY with JSON, no other text:
{"sentences":[{"${t.code}":"one sentence in ${t.name}","${n.code}":"its natural ${n.name} translation","words":[{"w":"word or phrase exactly as written in the sentence","t":"its ${n.name} translation exactly as used in this sentence","d":"its dictionary form","m":"its ${n.name} meaning in this sentence, in dictionary form"}]}],"struggled":[{"w":"${t.name} word or phrase","d":"its dictionary form","m":"${n.name} meaning, in dictionary form"}]}
- One item in "sentences" per sentence you say.
- In "words", list every content word of the sentence (skip words like a, the, is, and, to). Write ${n.name} meanings with nikkud if the language uses it.
- A phrase whose meaning is more than its words (such as a phrasal verb or an idiom) is ONE item: never list its parts ("gave", "up") as separate items. If other words sit inside the phrase ("give it up"), "w" is the whole stretch exactly as written. A phrase whose meaning is just its words ("last year") is split into its words.
- Dictionary form: ${pack.tutor.dictionaryForm}
- Example of one sentence: ${JSON.stringify(pack.tutor.example)}
- In "struggled", list ${t.name} words or phrases the learner just tried to say but got wrong, avoided, or asked about. Usually empty.`;
}

export function howDoISayPrompt(pack) {
  return pack.howDoISay + `\nReply ONLY with JSON: {"phrase":"the ${pack.target.name} phrase"}`;
}

/* When a tapped word has several dictionary entries and the code cannot tell which one is meant
   (spec 3.2), the AI is asked once, for that word only. options: [ { text, meaning } ]. */
export function choosePrompt(pack) {
  return `The learner tapped a word in a ${pack.target.name} sentence. Pick the dictionary entry that matches its meaning in this sentence. ` +
    'Reply ONLY with JSON: {"choice": the number of the entry, or 0 if none fits}';
}
export const chooseMessage = (sentence, word, options) =>
  `Sentence: "${sentence}"\nWord: "${word}"\nEntries:\n` + options.map((o, i) => `${i + 1}. ${o.text} = ${o.meaning}`).join('\n');
/* Returns the chosen option's index, or -1 when none fits. */
export function parseChoice(text, count) {
  const n = Number(extractJSON(text).choice);
  return Number.isInteger(n) && n >= 1 && n <= count ? n - 1 : -1;
}

/* Finds the JSON object in the model's text (some models wrap it in prose or ``` fences). */
export function extractJSON(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) throw new Error(uiText('ai.format'));
  try { return JSON.parse(m[0]); }
  catch (e) { throw new Error(uiText('ai.broken')); }
}

const str = v => typeof v === 'string' ? v.trim() : '';
const wordList = a => (Array.isArray(a) ? a : [])
  .map(x => Object.assign({ w: str(x && x.w), d: str(x && x.d) || str(x && x.w), m: str(x && x.m) }, str(x && x.t) ? { t: str(x.t) } : {}))
  .filter(x => x.w);

/* Checks a tutor reply and returns it in the shared shape. Throws if there is nothing to say. */
export function parseReply(pack, text) {
  const d = typeof text === 'string' ? extractJSON(text) : text;
  const t = pack.target.code, n = pack.native.code;
  const raw = Array.isArray(d && d.sentences) ? d.sentences : [];
  const sentences = raw
    .map(s => ({ target: str(s && s[t]), native: str(s && s[n]), words: wordList(s && s.words) }))
    .filter(s => s.target)
    .map(s => Object.assign(s, { words: joinSplitPhrases(s.target, s.words, pack.target.particles) }));
  if (!sentences.length) throw new Error(uiText('ai.empty'));
  return { sentences, struggled: wordList(d.struggled) };
}

export function parsePhrase(text) {
  const p = str(extractJSON(text).phrase);
  if (!p) throw new Error(uiText('ai.empty'));
  return p;
}

/* Turns a parsed reply back into the model's own JSON, to keep in the conversation history. */
export function replyToHistory(pack, reply) {
  const t = pack.target.code, n = pack.native.code;
  return JSON.stringify({ sentences: reply.sentences.map(s => ({ [t]: s.target, [n]: s.native, words: s.words })), struggled: reply.struggled });
}

/* Splits a sentence into plain text and the words or phrases from its breakdown, so each can be
   tapped: [ { text }, { text: 'gave up', word: { w, d, m } }, ... ]. Longer phrases win, and only
   whole words match ("up" does not match inside "cup"). */
export function markWords(text, words) {
  const list = words.filter(x => x.w).slice().sort((a, b) => b.w.length - a.w.length);
  const low = text.toLowerCase(), out = [];
  const isLetter = c => !!c && /[\p{L}\p{M}'’]/u.test(c);
  let i = 0, plain = '';
  while (i < text.length) {
    const hit = !isLetter(text[i - 1]) && list.find(x => low.startsWith(x.w.toLowerCase(), i) && !isLetter(text[i + x.w.length]));
    if (hit) {
      if (plain) out.push({ text: plain });
      out.push({ text: text.slice(i, i + hit.w.length), word: hit });
      plain = ''; i += hit.w.length;
    } else plain += text[i++];
  }
  if (plain) out.push({ text: plain });
  return out;
}

/* A safety net for when the AI lists a phrasal verb as two items ("gave" and "up") despite the
   instructions. A particle ("up") that has the same meaning as a word up to 3 words before it is
   joined with that word into one phrase: "gave up", or "give it up" with "to give" -> "to give up".
   A particle with its own meaning ("up" = לְמַעְלָה) is left alone. */
export function joinSplitPhrases(text, words, particles = []) {
  const P = new Set(particles), low = s => s.toLowerCase();
  const tokens = [...text.matchAll(/[\p{L}\p{M}'’]+/gu)];
  const single = new Map(words.filter(x => !/\s/.test(x.w)).map(x => [low(x.w), x]));
  const joined = [], used = new Set();
  tokens.forEach((tk, k) => {
    const part = single.get(low(tk[0]));
    if (!part || !P.has(low(part.w)) || !part.m) return;
    for (let j = k - 1; j >= Math.max(0, k - 3); j--) {
      const head = single.get(low(tokens[j][0]));
      if (!head || head === part || P.has(low(head.w)) || head.m !== part.m) continue;
      const w = text.slice(tokens[j].index, tk.index + tk[0].length);
      if (!joined.some(x => x.w === w)) joined.push(Object.assign({ w, d: head.d + ' ' + low(part.w), m: head.m }, head.t ? { t: head.t } : {}));
      used.add(part);
      break;
    }
  });
  return joined.length ? words.filter(x => !used.has(x)).concat(joined) : words;
}

/* ---------- End of session (spec 5.13) ---------- */

/* The conversation as plain text, for the summary. Tutor turns are stored as JSON. */
export function transcriptText(pack, msgs) {
  return msgs.map(m => {
    if (m.role === 'user') return /^\(The learner has just opened/.test(m.content) ? null : 'Learner: ' + m.content;
    try { return 'Tutor: ' + JSON.parse(m.content).sentences.map(s => s[pack.target.code]).join(' '); }
    catch (e) { return 'Tutor: ' + m.content; }
  }).filter(Boolean).join('\n');
}

/* settings.corrections: with 'end' the summary lists the learner's mistakes; with 'off' it does not
   (spec 5.10). */
export function summaryPrompt(pack, settings = {}) {
  const t = pack.target, n = pack.native;
  const fix = settings.corrections === 'off' ? 'Leave "corrections" empty.'
    : 'In "corrections", list up to 5 of the learner\'s mistakes that matter most, each with what they said and a better way to say it.';
  return `You are an ${t.name} tutor. Below is a spoken conversation with a ${n.name}-speaking learner. Write a short end-of-session summary for the learner.
Reply ONLY with JSON: {"summary":"one or two encouraging sentences in ${t.name}, simple words","corrections":[{"said":"what the learner said","better":"a better way to say it"}],"weakSpots":[{"note":"a short note for the tutor's next session, such as a grammar pattern, a missing word or a topic to avoid","kind":"understanding or speaking"}],"words":[{"w":"${t.name} word or phrase","d":"its dictionary form","m":"its ${n.name} meaning, in dictionary form"}]}
- ${fix}
- "weakSpots": 0 to 3 notes about real, repeated problems. "kind" is "understanding" when the learner did not understand the tutor, and "speaking" when they could not say something.
- "words": up to 5 ${t.name} words or phrases the learner needed and did not know. Dictionary form: ${pack.tutor.dictionaryForm}`;
}

export function parseSummary(text) {
  const d = extractJSON(text);
  const arr = a => Array.isArray(a) ? a : [];
  return {
    summary: str(d.summary),
    corrections: arr(d.corrections).map(c => ({ said: str(c && c.said), better: str(c && c.better) })).filter(c => c.said && c.better),
    weakSpots: arr(d.weakSpots).map(w => ({ note: str(w && w.note), kind: str(w && w.kind) === 'understanding' ? 'understanding' : 'speaking' })).filter(w => w.note),
    words: wordList(d.words),
  };
}

/* ---------- Drills: checking a spoken sentence by meaning (spec 6.2) ---------- */

export function sentenceCheckPrompt(pack) {
  return `You check a language learner's spoken translation. The learner heard a sentence and said it in the other language (${pack.target.name} or ${pack.native.name}). Their answer comes from speech recognition, so ignore spelling, punctuation and small recognition errors, and judge only the meaning.
Reply ONLY with JSON: {"correct": true or false, "better": "one natural, correct translation of the sentence, in the answer's language", "note": "if not correct, one short sentence in ${pack.target.name} saying what was wrong; otherwise empty"}
- "correct" is true when the answer means the same as the sentence, even if worded differently.`;
}
export const sentenceCheckMessage = (sentence, answer, answerLang) =>
  `Sentence: "${sentence}"\nThe learner's answer (in ${answerLang}): "${answer}"`;
export function parseCheck(text) {
  const d = extractJSON(text);
  return { correct: d.correct === true, better: str(d.better), note: str(d.note) };
}
