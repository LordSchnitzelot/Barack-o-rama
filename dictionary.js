/* Links words from the chat to dictionary entries, in code (spec 3.2, Linking chat words to the
   dictionary). Reads the dictionary files as they are stored (docs/drills-data-format.md).
   Plain code with no screen, tested by dictionary.test.mjs. Only words found here are saved to
   My words; anything else is shown in the chat and not saved. */
import { normalize, stripLabel } from './drills.js';

const dropArticle = t => t.replace(/^(a|an|the) /, '');
const unique = list => [...new Map(list.map(e => [e.id, e])).values()];

/* target and native are the parsed dictionary files, such as dictionary-en.json and
   dictionary-he.json. */
export function buildIndex(target, native) {
  const byForm = new Map(), partners = new Map();
  let longest = 1;
  for (const g of target.groups)
    for (const w of g.words) {
      const entry = { id: w.id, text: w.text, group: g.id, pos: g.pos };
      for (const f of new Set([stripLabel(w.text), ...(w.accepted || [])].map(normalize))) {
        if (!f) continue;
        if (!byForm.has(f)) byForm.set(f, []);
        byForm.get(f).push(entry);
        longest = Math.max(longest, f.split(' ').length);
      }
    }
  for (const g of native.groups)
    partners.set(g.id, {
      text: g.words.map(w => w.text).join(', '),
      forms: new Set(g.words.flatMap(w => [stripLabel(w.text), ...(w.accepted || [])]).map(normalize)),
    });
  return { byForm, partners, longest };
}

/* The meaning of an entry, from its partner group: "לְנַהֵל" for "to run (a business)". */
export const meaningOf = (index, entry) => (index.partners.get(entry.group) || { text: '' }).text;

const fits = (index, entry, meaning) => (index.partners.get(entry.group) || { forms: new Set() }).forms.has(meaning);

/* form: a word's dictionary form, such as "to run" or "gave up"; meaning: its meaning in the
   native language. Returns { entry, candidates }: entry is the clear match or null, and
   candidates are all entries spelled this way. Several candidates and no entry means the code
   could not tell them apart, and the AI may be asked (spec 3.2). */
export function lookup(index, form, meaning) {
  if (!index) return { entry: null, candidates: [] };
  const f = normalize(form);
  const candidates = unique(index.byForm.get(f) || index.byForm.get(dropArticle(f)) || []);
  if (candidates.length <= 1) return { entry: candidates[0] || null, candidates };
  /* Several entries share this form ("to run" and "to run (a business)"): keep the one whose
     partner group in the other language holds the meaning. */
  const m = normalize(meaning || '');
  const fit = m ? candidates.filter(e => fits(index, e, m)) : [];
  return { entry: fit.length === 1 ? fit[0] : null, candidates };
}

export const findEntry = (index, form, meaning) => lookup(index, form, meaning).entry;

/* Finds dictionary words and phrases in a sentence, longest first, left to right:
   [ { text: 'gave up', start, end, candidates } ], with start and end positions in the text. */
export function findInText(index, text) {
  if (!index) return [];
  const tokens = [...String(text).matchAll(/[\p{L}\p{M}'’]+/gu)];
  const out = [];
  for (let i = 0; i < tokens.length;) {
    let hit = null;
    for (let n = Math.min(index.longest, tokens.length - i); n >= 1 && !hit; n--) {
      const form = normalize(tokens.slice(i, i + n).map(t => t[0]).join(' '));
      const c = index.byForm.get(form);
      if (c) hit = { n, candidates: unique(c) };
    }
    if (!hit) { i++; continue; }
    const start = tokens[i].index, last = tokens[i + hit.n - 1];
    out.push({ text: text.slice(start, last.index + last[0].length), start, end: last.index + last[0].length, candidates: hit.candidates });
    i += hit.n;
  }
  return out;
}

/* A dictionary entry made of several words ("give up", "take care"), not counting the "to" of
   an infinitive. */
export const isPhrase = entry => / /.test(stripLabel(entry.text).replace(/^to /, ''));

/* The dictionary phrases in a sentence, to show each as one tappable unit whatever the AI did.
   Returns word items like the tutor's: { w, d, m }. A phrase spelled like two entries keeps the
   AI's meaning for its first word, so the tap can tell them apart. */
export function phrasesInText(index, text, words = []) {
  return findInText(index, text)
    .filter(h => h.candidates.some(isPhrase))
    .map(h => {
      const first = h.text.split(/\s+/)[0].toLowerCase();
      const ai = words.find(x => x.w.toLowerCase() === h.text.toLowerCase()) || words.find(x => x.w.toLowerCase() === first);
      const only = h.candidates.length === 1 ? h.candidates[0] : null;
      return { w: h.text, d: only ? stripLabel(only.text) : h.text.toLowerCase(), m: ai ? ai.m : only ? meaningOf(index, only) : '' };
    });
}

/* DEFAULT: small grammar words are not saved from "How do I say it?" answers; "I would like a
   coffee" saves "coffee" and the verb, not "I" or "a". */
export const SKIP_IN_PHRASES = ['pronoun', 'determiner', 'preposition', 'conjunction'];

/* The dictionary words inside a "How do I say it?" answer (spec 5.9), to save as "can't say yet".
   nativeText is what the learner said in their own language; when a word has several entries,
   the one whose meaning appears there is chosen, and otherwise the word is skipped. */
export function wordsInPhrase(index, text, nativeText) {
  const said = ' ' + normalize(nativeText || '') + ' ';
  const out = [];
  for (const h of findInText(index, text)) {
    const cands = h.candidates.filter(e => !SKIP_IN_PHRASES.includes(e.pos));
    const fit = cands.length > 1 ? cands.filter(e => [...(index.partners.get(e.group) || { forms: [] }).forms].some(f => said.includes(' ' + f + ' '))) : cands;
    if (fit.length === 1 && !out.includes(fit[0])) out.push(fit[0]);
  }
  return out;
}
