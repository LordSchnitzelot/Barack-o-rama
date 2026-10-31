/* The app's entry: the home screen with its three modes (spec 4), Settings (spec 9) and My words.
   The screens live in talk.js (Chat and Guide) and drill-screen.js (Drills); what they share
   lives in shell.js. */
import { $, esc, S, saveSettings, speech, stopAudio, play, ai, wordsReady, byNewest, W, pack, toast, hideToast, applyUiLang, countWords, setStatus } from './shell.js';
import { t } from './strings.js';
import * as Words from './words.js';
import * as Backup from './backup.js';
import * as store from './store.js';
import { openTalk, endTalk, relabelTalk } from './talk.js';
import { openDrills, closeDrills, relabelDrills } from './drill-screen.js';

speech.load();

/* ---------- Moving between screens ---------- */
const TITLES = { home: 'app.title', talk: 'app.talk', drills: 'drills.title' };
function show(view) { document.body.dataset.view = view; $('#title').textContent = t(TITLES[view]); }
function goHome() { stopAudio(); closeDrills(); show('home'); }
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
  const m = b.dataset.go;
  if (m === 'drills') { show('drills'); openDrills(); }
  else { show('talk'); openTalk(m); }
});
$('#back').onclick = () => document.body.dataset.view === 'talk' ? endTalk(goHome) : goHome();
$('#end').onclick = () => endTalk(goHome);
show('home');

/* ---------- My words ---------- */
const T = pack.target, N = pack.native;
const dots = rec => { const n = Words.score(rec); return '●'.repeat(n) + '○'.repeat(Words.MAX_SCORE - n); };
const scoreHtml = rec => `<span aria-label="${esc(t('words.of', { n: Words.score(rec), max: Words.MAX_SCORE }))}">${dots(rec)}</span>`;
$('#wb').onclick = async () => {
  await wordsReady;
  const list = byNewest();
  $('#wl').innerHTML = `<h3>${esc(t('words.title'))}</h3>` + (list.length
    ? `<p class="note">${esc(t('words.help'))}</p>` +
      list.map(x => `<div class="row"><span><b lang="${T.code}" dir="${T.dir}">${esc(x.text)}</b><br><small lang="${N.code}" dir="${N.dir}">${esc(x.meaning)}</small><br><small class="sc">${esc(t('words.understands'))} ${scoreHtml(x.understand)} · ${esc(t('words.canSay'))} ${scoreHtml(x.say)}</small></span><button class="ic" data-id="${esc(x.id)}" aria-label="${esc(t('words.hear', { w: x.text }))}">▶</button></div>`).join('')
    : `<p class="note">${esc(t('words.empty'))}</p>`) +
    `<button class="close" onclick="this.closest('dialog').close()">${esc(t('common.close'))}</button>`;
  $('#wl').querySelectorAll('.ic').forEach(b => b.onclick = () => { stopAudio(); play(W.get(b.dataset.id).text, 'target'); });
  $('#wl').showModal();
};

/* ---------- Settings (spec 9) ---------- */
const FIELDS = { ui: 'ui', pv: 'pv', rk: 'rk', gm: 'gm', gk: 'gk', mo: 'model', lv: 'level', se: 'en', sh: 'he', co: 'corrections', sp2: 'speed', vo: 'voice', rb: 'rateBy' };
/* The tutor voices: the model's own, then Phonon's American and British voices. */
function fillVoices() {
  const V = T.voices || { list: [] };
  const group = accent => V.list.filter(v => v.accent === accent)
    .map(v => `<option value="${esc(v.name)}">${esc(v.name)} · ${esc(t(v.gender === 'male' ? 'set.man' : 'set.woman'))}</option>`).join('');
  $('#vo').innerHTML = `<option value="">${esc(t('set.voiceDefault'))}</option>` +
    `<optgroup label="${esc(t('set.voiceUS'))}">${group('US')}</optgroup><optgroup label="${esc(t('set.voiceUK'))}">${group('UK')}</optgroup>`;
}
function fill() { for (const [id, k] of Object.entries(FIELDS)) $('#' + id).value = S[k]; $('#sp').value = S.speed; }
async function fillStats() {
  await wordsReady;
  $('#dstats').textContent = t('drills.stats', { n: await store.getMeta('drills', 0), words: W.size });
}
/* After the interface language changes: every screen's texts (spec 9, UI language). */
function relabel() {
  applyUiLang();
  setStatus('');
  $('#title').textContent = t(TITLES[document.body.dataset.view]);
  countWords(); fillVoices(); relabelTalk(); relabelDrills(); fillStats();
}
fillVoices();
$('#sb').onclick = () => { fill(); fillStats(); $('#set').showModal(); };
$('#save').onclick = () => {
  const c = {};
  for (const [id, k] of Object.entries(FIELDS)) c[k] = $('#' + id).value.trim();
  c.model = c.model || S.model;
  const relang = c.ui !== S.ui;
  saveSettings(c);
  if (relang) relabel();
  fill(); $('#set').close(); speech.load();
};
$('#sp').onchange = e => { saveSettings({ speed: e.target.value }); speech.load(); };
/* Plays a short sentence in the voice picked in the list, before it is saved. */
$('#vtry').onclick = () => { stopAudio(); speech.speak(T.voices.sample, T, { voice: $('#vo').value }); };
fill();
if (!ai.hasKey()) setTimeout(() => $('#sb').click(), 300);

/* ---------- Backup export and import (spec 8, 9) ---------- */
$('#bexp').onclick = async () => {
  try {
    const [words, notes, meta] = await Promise.all([store.allWords(), store.allNotes(), store.allMeta()]);
    const name = Backup.fileName();
    const file = new File([JSON.stringify(Backup.makeBackup({ words, notes, meta, settings: S }), null, 1)], name, { type: 'application/json' });
    /* An app opened from the iPhone home screen cannot download files, so it offers the share sheet
       ("Save to Files"). Everywhere else the file is downloaded. */
    if (standalone() && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); }
      catch (e) { if (e.name === 'AbortError') return; throw e; }
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    }
    toast(t('backup.saved', { file: name }), { good: true });
  } catch (e) { toast(e.message); }
};
$('#bimp').onclick = () => $('#bfile').click();
$('#bfile').onchange = async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const b = Backup.readBackup(await f.text());
    await wordsReady;
    const words = Backup.newer(await store.allWords(), b.words);
    const notes = Backup.newer(await store.allNotes(), b.notes);
    const meta = Backup.mergeMeta(await store.allMeta(), b.meta);
    await store.putWords(words); await store.putNotes(notes); await store.putMetas(meta);
    words.forEach(r => W.set(r.id, r));
    countWords();
    /* The settings come back too, except the API keys, which stay as they are on this device. */
    const relang = b.settings.ui && b.settings.ui !== S.ui;
    saveSettings(Object.fromEntries(Object.entries(b.settings).filter(([k]) => k in S)));
    if (relang) relabel();
    fill(); fillStats(); speech.load();
    toast(words.length || notes.length ? t('backup.restored', { words: words.length, notes: notes.length }) : t('backup.nothingNew'), { good: true });
  } catch (err) {
    if (!(err instanceof Backup.BackupError)) console.error(err);
    toast(err instanceof Backup.BackupError ? t('backup.' + err.code) : t('backup.failed', { e: err.message }));
  }
};

/* ---------- Installing to the home screen (spec 3.2, PWA) ---------- */
function standalone() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
function showInstall() { $('#iyes').hidden = !standalone(); $('#ino').hidden = standalone(); }
let installPrompt = null;
/* Chrome and Edge offer their own install prompt; it is kept so Settings can show an Install button. */
window.addEventListener('beforeinstallprompt', e => { installPrompt = e; $('#ibtnrow').hidden = false; });
window.addEventListener('appinstalled', () => { installPrompt = null; $('#ibtnrow').hidden = true; showInstall(); });
$('#ibtn').onclick = async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => {});
  installPrompt = null; $('#ibtnrow').hidden = true;
};
showInstall();

/* The service worker keeps a copy of the app's files, so it opens without a connection (Drills
   word practice then still works). It always asks the network first, so a new version on the
   site is used as soon as it is there. */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker not registered', e));
}
$('#toast').onclick = e => { if (e.target === e.currentTarget) hideToast(); };
