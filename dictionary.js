/* Links words from the tutor's replies to dictionary entries, in code (spec 3.2, Linking chat
   words to the dictionary). Reads the dictionary files as they are stored
   (docs/drills-data-format.md). Plain code with no screen, tested by dictionary.test.mjs. */
import { normalize, stripLabel } from './drills.js';

const dropArticle = t => t.replace(/^(a|an|the) /, '');

/* target and native are the parsed dictionary files, such as dictionary-en.json and
   dictionary-he.json. */
export function buildIndex(target, native) {
  const byForm = new Map(), meanings = new Map();
  for (const g of target.groups)
    for (const w of g.words) {
      const entry = { id: w.id, text: w.text, group: g.id };
      for (const f of new Set([stripLabel(w.text), ...(w.accepted || [])].map(normalize))) {
        if (!f) continue;
        if (!byForm.has(f)) byForm.set(f, []);
        byForm.get(f).push(entry);
      }
    }
  for (const g of native.groups)
    meanings.set(g.id, new Set(g.words.flatMap(w => [stripLabel(w.text), ...(w.accepted || [])]).map(normalize)));
  return { byForm, meanings };
}

/* form: the word's dictionary form, such as "to run" or "gave up"; meaning: its meaning in the
   native language. Returns { id, text, group } or null when there is no clear match. */
export function findEntry(index, form, meaning) {
  if (!index) return null;
  const f = normalize(form);
  const found = index.byForm.get(f) || index.byForm.get(dropArticle(f)) || [];
  /* One entry can be listed twice under the same form; count each entry once. */
  const cands = [...new Map(found.map(e => [e.id, e])).values()];
  if (cands.length <= 1) return cands[0] || null;
  /* Several entries share this form ("to run" and "to run (a business)"): keep the one whose
     partner group in the other language holds the meaning. */
  const m = normalize(meaning || '');
  const fit = cands.filter(e => m && (index.meanings.get(e.group) || new Set()).has(m));
  return fit.length === 1 ? fit[0] : null;
}
