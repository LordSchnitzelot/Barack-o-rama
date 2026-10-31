/* What every screen shares: settings, messages to the user, the services (AI, voices), the
   dictionary and My words. The screens (talk.js, drill-screen.js) and app.js import from here. */
import pack from './packs/en-he/pack.js';
import { choosePrompt, chooseMessage, parseChoice } from './tutor.js';
import { createAI, createSpeech } from './services.js';
import { buildIndex, lookup, meaningOf } from './dictionary.js';
import * as Words from './words.js';
import * as store from './store.js';
import { isListed } from './drill-data.js';
import { t, setUiLang, setLanguages, applyStrings } from './strings.js';

export { pack };
export const $ = s => document.querySelector(s);
export const ld = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
export const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
export const esc = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- Settings (spec 9) ----------
   en, he: subtitles for the target and native language, 'show' or 'hide' (a hidden line is
   revealed by tapping it; spec 5.6). corrections: 'live' (as we go), 'end' or 'off' (spec 5.10).
   level: DEFAULT (not in the spec): a starting level the tutor uses until it knows the learner.
   ui: the interface language, 'en' or 'he' (spec 9; English by default). voice: the tutor's
   Phonon voice, a name from pack.target.voices, or '' for the model's default voice. */
export const S = Object.assign({ pv: 'groq', rk: '', gm: '', gk: '', model: 'gemini-3.8-flash', level: 'intermediate', en: 'show', he: 'show', speed: '1', rateBy: 'phonon', corrections: 'live', ui: 'en', voice: '' }, ld('sp2_s', {}));
if (/2\.5/.test(S.model)) S.model = 'gemini-3.8-flash';
/* The first demo stored subtitles as on / tap / hidden. */
for (const k of ['en', 'he']) if (!['show', 'hide'].includes(S[k])) S[k] = S[k] === 'on' ? 'show' : 'hide';
export const saveSettings = changes => { Object.assign(S, changes); sv('sp2_s', S); };

/* ---------- Interface language (spec 3.2, Localized UI) ---------- */
setLanguages(pack.target.code, pack.native.code);
export function applyUiLang() { setUiLang(S.ui); applyStrings(); }
applyUiLang();

export const setStatus = text => { const el = $('#st'); if (el) el.textContent = text; };
/* A short message over the screen: red for problems, green with good: true. action = { label, run }
   adds a button (for example "Reload"); such a message stays until it is tapped.
   The message is a popover where the browser supports it, so it shows above an open dialog
   (Settings) instead of behind it. */
export function toast(m, { good = false, action = null } = {}) {
  const el = $('#toast');
  el.textContent = m; el.className = good ? 'good' : ''; el.hidden = false;
  if (action) { const b = document.createElement('button'); b.className = 'pill'; b.textContent = action.label; b.onclick = action.run; el.appendChild(b); }
  if (el.showPopover) try { if (el.matches(':popover-open')) el.hidePopover(); el.showPopover(); } catch (e) {}
  clearTimeout(toast.timer);
  if (!action) toast.timer = setTimeout(hideToast, 5000);
}
export function hideToast() {
  const el = $('#toast');
  el.hidden = true;
  if (el.hidePopover) try { el.hidePopover(); } catch (e) {}
}
export function needKey() { $('#sb').click(); toast(t('common.needKey')); }

/* ---------- Services ---------- */
export const ai = createAI(() => S);
export const speech = createSpeech({ settings: () => S, status: setStatus, toast, target: pack.target, voices: pack.target.voices });

/* side is 'target' or 'native'. slow plays the target language more slowly (spec 5.6). */
let seq = 0;
export function stopAudio() { seq++; speech.stop(); }
export const play = (text, side, slow) => speech.speak(text, pack[side], { slow });
/* Plays the tutor's sentences one after another. All of them start generating at once, so the
   next one is ready when the one before it ends (spec 3.2, Streaming by sentence). */
export async function playAll(texts) {
  const id = ++seq;
  speech.prepare(texts, pack.target);
  for (const text of texts) { if (id !== seq) return; await play(text, 'target'); }
}

/* ---------- Dictionary ---------- */
let dict = null;
export const getDict = () => dict;
/* The raw dictionary files and sentences, for Drills. */
export const data = {};
export const dictReady = Promise.all([
  ...[pack.target.code, pack.native.code].map(c => fetch(pack.drills.dictionaries[c]).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })),
  fetch(pack.drills.sentences).then(r => r.ok ? r.json() : null).catch(() => null),
]).then(([tg, nt, sn]) => { data.target = tg; data.native = nt; data.sentences = sn; dict = buildIndex(tg, nt); })
  .catch(e => { console.warn('Dictionary not loaded', e); toast(t('store.noDict')); });
export const link = (form, meaning) => lookup(dict, form, meaning).entry;
export const meaning = entry => meaningOf(dict, entry);

/* ---------- My words: saved on the device with scores (spec 8) ----------
   Only dictionary entries are saved (spec 3.2); anything else is shown in the chat only. */
export const W = new Map(); // id -> record, including words only practiced in Drills
/* My words lists the flagged words and weak spots (spec 6), newest first. */
export const byNewest = () => [...W.values()].filter(isListed).sort((a, b) => b.modified - a.modified);
export const countWords = () => { const b = $('#wb'); if (b) b.textContent = t('app.words', { n: byNewest().length }); };
/* Loads the saved words, and carries over the first demo's list (kept in localStorage) once.
   Words saved before only dictionary words were kept are removed. */
export const wordsReady = (async () => {
  const all = await store.allWords();
  all.filter(r => r.entry).forEach(r => W.set(r.id, r));
  const gone = all.filter(r => !r.entry).map(r => r.id);
  if (gone.length) await store.deleteWords(gone);
  const old = ld('sp_w', null);
  if (old) {
    await dictReady;
    const moved = Words.fromOldList(old, link, pack.target.code).filter(r => !W.has(r.id));
    await store.putWords(moved);
    moved.forEach(r => W.set(r.id, r));
    try { localStorage.removeItem('sp_w'); } catch (e) {}
  }
  if (!(await store.available())) toast(t('store.private'));
  countWords();
})().catch(e => { console.error(e); toast(t('store.loadFailed', { e: e.message })); });

/* Saves a dictionary entry to My words. info = { meaning, example, source }. */
export async function flag(entry, info) {
  await wordsReady;
  const id = Words.wordId(entry.text, entry);
  const r = Words.flag(W.get(id), Object.assign({ text: entry.text, entry, lang: pack.target.code }, info), Date.now());
  W.set(id, r); countWords();
  try { await store.putWord(r); } catch (e) { toast(t('store.saveFailed', { e: e.message })); }
  keepData();
  return r;
}
/* Saves a record changed elsewhere (Drills scores). */
export async function saveWord(r) {
  W.set(r.id, r); countWords();
  try { await store.putWord(r); } catch (e) { toast(t('store.saveFailed', { e: e.message })); }
  keepData();
}
/* Once there is progress worth keeping, asks the browser not to clear this site's data when space
   runs low (spec 12, risk 10: iPhone can clear data after a week of non-use). Chrome and Safari
   decide by themselves, mostly by whether the app is installed; Firefox may ask the learner. */
let askedToKeep = false;
function keepData() {
  if (askedToKeep || !navigator.storage || !navigator.storage.persist) return;
  askedToKeep = true;
  navigator.storage.persisted().then(yes => yes || navigator.storage.persist()).catch(() => {});
}

/* Tapping a word (spec 5.8, 6.6): asks "Show translation?" first; on yes, shows the meaning and a
   pronunciation button, and flags the word for practice if it is in the dictionary. The code finds
   the entry; only if several entries fit and the code cannot tell which is meant, the AI is asked,
   for this word only. info = { text, form, meaning, example }. onFlag(entry) is called once saved. */
export function openWord(info, onFlag) {
  const box = $('#wd');
  box.innerHTML = `<h3 dir="${pack.target.dir}" lang="${pack.target.code}">${esc(info.text)}</h3><p class="note">${t('word.ask')}</p><div class="btns"><button class="pill" id="wy">${t('word.show')}</button><button class="pill" id="wnx">${t('word.notNow')}</button></div>`;
  $('#wnx').onclick = () => box.close();
  $('#wy').onclick = () => reveal(info, onFlag);
  box.showModal();
}
async function reveal(info, onFlag) {
  const box = $('#wd');
  const found = lookup(dict, info.form || info.text, info.meaning);
  const show = (title, shown, note) => {
    box.innerHTML = `<h3 dir="${pack.target.dir}" lang="${pack.target.code}">${esc(title)}</h3><p dir="${pack.native.dir}" lang="${pack.native.code}" class="mean">${esc(shown)}</p><button class="pill" id="wp">${t('common.hear')}</button><p class="note" id="wn" style="margin-top:12px">${esc(note)}</p><button class="close" onclick="this.closest('dialog').close()">${t('common.close')}</button>`;
    $('#wp').onclick = () => { stopAudio(); play(title, 'target'); };
  };
  const save = entry => {
    /* The dictionary's translations: every word of the partner group ("ללכת" for "will go"). */
    show(entry.text, meaningOf(dict, entry) || info.meaning, t('word.saved'));
    flag(entry, { meaning: meaningOf(dict, entry), example: info.example, source: 'tapped' });
    if (onFlag) onFlag(entry);
  };
  if (found.entry) return save(found.entry);
  show(info.text, info.meaning, found.candidates.length ? t('word.checking') : t('word.notInDict'));
  if (!found.candidates.length) return;
  try {
    const opts = found.candidates.map(e => ({ text: e.text, meaning: meaningOf(dict, e) }));
    const i = parseChoice(await ai.complete(choosePrompt(pack), [{ role: 'user', content: chooseMessage(info.example || info.text, info.text, opts) }]), opts.length);
    if (!box.open) return;
    if (i >= 0) save(found.candidates[i]);
    else $('#wn').textContent = t('word.meaningNotInDict');
  } catch (e) { if (box.open) $('#wn').textContent = t('word.checkFailed', { e: e.message }); }
}

/* ---------- Weak spots (spec 8): notes the tutor writes after each session ---------- */
export async function weakSpots() { return (await store.allNotes()).sort((a, b) => a.created - b.created); }
