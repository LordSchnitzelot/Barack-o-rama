/* My words (spec 8, Flagged words): each saved word with its two scores, "understands" and
   "can say". Plain code with no screen, tested by words.test.mjs; store.js saves the records.

   A record:
     { id, lang, text, meaning, example, entry,     // entry: the dictionary word id, or null
       sources: [ { source, time } ],              // tapped, how-do-I-say-it, model-detected...
       understand: Record | null, say: Record | null, // spaced-repetition records from drills.js
       created, modified }
   A saved word is always a dictionary entry and uses the entry's id, so Drills (build step 7)
   can pick it up. (wordId still accepts plain text, for records saved before that rule.) */
import { normalize, newRecord, flagDirections, markFlagged, INTERVALS } from './drills.js';

export const wordId = (text, entry) => entry ? entry.id : 't:' + normalize(text);

/* Saves a flag on a new or existing record. info = { text, meaning, example, source, entry, lang }.
   A linked word is shown with its dictionary text ("to run (a business)"). */
export function flag(old, info, now) {
  const r = old || {
    id: wordId(info.text, info.entry), lang: info.lang, text: info.entry ? info.entry.text : info.text,
    meaning: info.meaning || '', example: info.example || '', entry: info.entry ? info.entry.id : null,
    sources: [], understand: null, say: null, created: now,
  };
  if (!r.meaning && info.meaning) r.meaning = info.meaning;
  if (!r.example && info.example) r.example = info.example;
  r.sources.push({ source: info.source, time: now });
  for (const dir of flagDirections(info.source)) r[dir] = markFlagged(r[dir] || newRecord(now), info.source, now);
  r.modified = now;
  return r;
}

/* A score is how far the word has climbed the review ladder in one direction: 0 when it is new
   or was just missed, up to MAX_SCORE when it has been right many times in a row. */
export const MAX_SCORE = INTERVALS.length - 1;
export const score = rec => rec ? rec.level : 0;

/* The drill number at which the word is next due, across both directions (0: at once). */
export const nextReview = r => Math.min(...[r.understand, r.say].filter(Boolean).map(x => x.due));

/* Records saved by the first demo were { w, m, src, t }. */
export function fromOldList(list, link, lang) {
  const out = new Map();
  for (const x of list || []) {
    if (!x || !x.w) continue;
    const entry = link(x.w, x.m);
    if (!entry) continue; // only dictionary words are saved (spec 3.2)
    const id = wordId(x.w, entry);
    out.set(id, flag(out.get(id), { text: x.w, meaning: x.m, source: x.src || 'tapped', entry, lang }, x.t || Date.now()));
  }
  return [...out.values()];
}
