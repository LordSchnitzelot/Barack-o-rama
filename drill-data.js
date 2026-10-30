/* Connects drills.js to the stored files and to My words.
   - The dictionary files (docs/drills-data-format.md) become the data shape drills.js uses.
   - Progress lives in the My words records (words.js), one per target-language entry, so a word
     flagged in Chat comes up in Drills as a weak word, and Drills scores show in My words.
   Plain code with no screen, tested by drill-data.test.mjs. */
import { wordKey } from './drills.js';

/* files = { target, native, sentences } as stored; target and native are the dictionary files. */
export function toDrillsData(files) {
  const T = files.target.language, N = files.native.language;
  const dicts = { [T]: {}, [N]: {} }, where = {};
  for (const [lang, file] of [[T, files.target], [N, files.native]]) {
    for (const g of file.groups) {
      dicts[lang][g.id] = g.words.map((w, i) => {
        where[w.id] = { group: String(g.id), word: i };
        return { id: w.id, text: w.text, rank: w.rank, forms: w.accepted, sayAs: w.sayAs, pos: g.pos, verbForm: g.verbForm };
      });
    }
  }
  const sentences = ((files.sentences && files.sentences.sentences) || []).map(s => ({
    id: s.id, lang: s.language, text: s.text, difficulty: s.difficulty,
    tags: s.tags.filter(t => where[t.word]).map(t => Object.assign({ text: t.text, id: t.word }, where[t.word])),
  }));
  return { target: T, native: N, dicts, sentences, where };
}

/* The target-language entry at a { group, word } reference. */
export const entryAt = (data, ref) => (data.dicts[data.target][ref.group] || [])[ref.word];

/* My words records -> drills.js profile ({ progress: { 'group:word': { understand, say } } }). */
export function progressFromWords(data, records) {
  const progress = {};
  for (const r of records) {
    const at = r.entry && data.where[r.entry];
    if (!at || !data.dicts[data.target][at.group]) continue;
    const p = {};
    if (r.understand) p.understand = r.understand;
    if (r.say) p.say = r.say;
    progress[wordKey(at)] = p;
  }
  return { progress };
}

/* After a drill: the My words records to save for the words whose progress changed.
   existing: Map id -> record. meaningOf(entry) gives the native-language meaning for a new record. */
export function wordsFromProgress(data, profile, existing, keys, meaningOf, now) {
  const out = [];
  for (const k of keys) {
    const p = profile.progress[k];
    if (!p) continue;
    const [group, word] = k.split(':');
    const e = entryAt(data, { group, word: +word });
    if (!e) continue;
    const old = existing.get(e.id);
    const r = old ? Object.assign({}, old) : {
      id: e.id, lang: data.target, text: e.text, meaning: meaningOf(e), example: '', entry: e.id,
      sources: [], understand: null, say: null, created: now,
    };
    r.understand = p.understand || r.understand || null;
    r.say = p.say || r.say || null;
    r.modified = now;
    out.push(r);
  }
  return out;
}

/* Which words My words lists: the ones flagged somewhere, and weak spots (spec 6: "the list of
   flagged words and weak spots, with their scores"). Words only ever drilled and known are kept
   for Drills but not listed. */
export const isListed = r => (r.sources && r.sources.length > 0) || !!(r.understand && r.understand.weak) || !!(r.say && r.say.weak);
