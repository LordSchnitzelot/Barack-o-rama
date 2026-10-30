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
     { sentences: [ { target, native, words: [ { w, d, m } ] } ], struggled: [ { w, d, m } ] }
   w is the word or phrase as written ("gave up"), d its dictionary form ("gave up"; "to run" for
   "runs") and m its meaning in that same form. The app links d and m to a dictionary entry in
   code (spec 3.2, Linking chat words to the dictionary; see dictionary.js). */

/* How many flagged words the tutor is told about; the newest ones are kept. */
export const MAX_PROFILE_WORDS = 20;

export function tutorPrompt(pack, profile = {}, settings = {}) {
  const T = pack.tutor, t = pack.target;
  const level = T.levels[profile.level] || T.levels.intermediate;
  const corrections = T.corrections[settings.corrections] || T.corrections.live;
  const words = (profile.words || []).slice(-MAX_PROFILE_WORDS);
  const spots = profile.weakSpots || [];
  const lines = [T.role, '', 'How to teach:', ...T.rules.map(r => '- ' + r), '- ' + corrections, '', 'The learner:', '- ' + level];
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
{"sentences":[{"${t.code}":"one sentence in ${t.name}","${n.code}":"its natural ${n.name} translation","words":[{"w":"word or phrase exactly as written in the sentence","d":"its dictionary form","m":"its ${n.name} meaning in this sentence, in dictionary form"}]}],"struggled":[{"w":"${t.name} word or phrase","d":"its dictionary form","m":"${n.name} meaning, in dictionary form"}]}
- One item in "sentences" per sentence you say.
- In "words", list every content word of the sentence (skip words like a, the, is, and, to). Write ${n.name} meanings with nikkud if the language uses it.
- A phrase whose meaning is more than its words (such as a phrasal verb or an idiom) is ONE item, not one item per word. A phrase whose meaning is just its words is split into its words.
- Dictionary form: ${pack.tutor.dictionaryForm}
- In "struggled", list ${t.name} words or phrases the learner just tried to say but got wrong, avoided, or asked about. Usually empty.`;
}

export function howDoISayPrompt(pack) {
  return pack.howDoISay + `\nReply ONLY with JSON: {"phrase":"the ${pack.target.name} phrase"}`;
}

/* Finds the JSON object in the model's text (some models wrap it in prose or ``` fences). */
export function extractJSON(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('The AI did not reply in the expected format. Try again.');
  try { return JSON.parse(m[0]); }
  catch (e) { throw new Error('The AI sent a broken reply. Try again.'); }
}

const str = v => typeof v === 'string' ? v.trim() : '';
const wordList = a => (Array.isArray(a) ? a : [])
  .map(x => ({ w: str(x && x.w), d: str(x && x.d) || str(x && x.w), m: str(x && x.m) }))
  .filter(x => x.w);

/* Checks a tutor reply and returns it in the shared shape. Throws if there is nothing to say. */
export function parseReply(pack, text) {
  const d = typeof text === 'string' ? extractJSON(text) : text;
  const t = pack.target.code, n = pack.native.code;
  const raw = Array.isArray(d && d.sentences) ? d.sentences : [];
  const sentences = raw
    .map(s => ({ target: str(s && s[t]), native: str(s && s[n]), words: wordList(s && s.words) }))
    .filter(s => s.target);
  if (!sentences.length) throw new Error('The AI sent an empty reply. Try again.');
  return { sentences, struggled: wordList(d.struggled) };
}

export function parsePhrase(text) {
  const p = str(extractJSON(text).phrase);
  if (!p) throw new Error('The AI sent an empty reply. Try again.');
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
