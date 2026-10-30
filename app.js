/* The Chat screen (demo). It wires the page to the language pack, the tutor and the services;
   the language pair, the tutor's instructions and the providers all live in those files. */
import pack from './packs/en-he/pack.js';
import { tutorPrompt, howDoISayPrompt, parseReply, parsePhrase, replyToHistory, markWords } from './tutor.js';
import { createAI, createSpeech, listen, canListen } from './services.js';
import { buildIndex, findEntry } from './dictionary.js';
import * as Words from './words.js';
import * as store from './store.js';

const $ = s => document.querySelector(s);
const ld = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
const sv = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* corrections: 'live' (as we go, the default), 'end' or 'off' (spec 5.10); its setting arrives in build step 3. */
let S = Object.assign({ pv: 'groq', rk: '', gm: '', gk: '', model: 'gemini-3.8-flash', level: 'intermediate', en: 'on', he: 'tap', speed: '1', rateBy: 'phonon', corrections: 'live' }, ld('sp2_s', {}));
if (/2\.5/.test(S.model)) S.model = 'gemini-3.8-flash';
const LV = { beginner: ['on', 'on'], intermediate: ['on', 'tap'], advanced: ['tap', 'tap'] };
const setStatus = t => $('#st').textContent = t;
function toast(m) { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 5000); }
function needKey() { toast('Add your API key in Settings first.'); $('#set').showModal(); }

const ai = createAI(() => S);
const speech = createSpeech({ settings: () => S, status: setStatus, toast, target: pack.target });
speech.load();

/* side is 'target' or 'native' */
let seq = 0;
function stopAudio() { seq++; speech.stop(); }
const play = (text, side) => speech.speak(text, pack[side]);
async function playAll(sentences) {
  const id = ++seq;
  for (const s of sentences) { if (id !== seq) return; await play(s.target, 'target'); }
}

/* ---------- My words: saved on the device with scores (spec 8) ---------- */
/* The dictionary, used to link flagged words to Drills entries. Without it, words are still saved. */
let dict = null;
const dictReady = Promise.all([pack.target.code, pack.native.code].map(c => fetch(pack.drills.dictionaries[c]).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })))
  .then(([t, n]) => { dict = buildIndex(t, n); })
  .catch(e => console.warn('Dictionary not loaded; words are saved without a link to Drills', e));
const link = (form, meaning) => findEntry(dict, form, meaning);

const W = new Map(); // id -> record
const byNewest = () => [...W.values()].sort((a, b) => b.modified - a.modified);
const countWords = () => { $('#wb').textContent = 'My words (' + W.size + ')'; };
/* Loads the saved words, and carries over the first demo's list (kept in localStorage) once. */
const wordsReady = (async () => {
  for (const r of await store.allWords()) W.set(r.id, r);
  const old = ld('sp_w', null);
  if (old) {
    await dictReady;
    const moved = Words.fromOldList(old, link, pack.target.code).filter(r => !W.has(r.id));
    await store.putWords(moved);
    moved.forEach(r => W.set(r.id, r));
    try { localStorage.removeItem('sp_w'); } catch (e) {}
  }
  if (!(await store.available())) toast('This browser is not saving data (private window?). My words will be lost when you close it.');
  countWords();
})().catch(e => { console.error(e); toast('Could not load My words: ' + e.message); });

/* info = { text, form, meaning, example, source }; form is the dictionary form used for the link. */
async function flag(info) {
  await wordsReady;
  const entry = link(info.form || info.text, info.meaning);
  const id = Words.wordId(info.text, entry);
  const r = Words.flag(W.get(id), Object.assign({ entry, lang: pack.target.code }, info), Date.now());
  W.set(id, r); countWords();
  try { await store.putWord(r); } catch (e) { toast('Could not save the word: ' + e.message); }
  return r;
}
function openWord(info) {
  const entry = link(info.form || info.text, info.meaning), text = entry ? entry.text : info.text;
  $('#wd').innerHTML = `<h3>${esc(text)}</h3><p dir="rtl" style="font-size:18px;margin:4px 0 12px">${esc(info.meaning)}</p><button class="pill" id="wp">▶ Hear it</button><p class="note" style="margin-top:12px">Flagged for practice.</p><button class="close" onclick="this.closest('dialog').close()">Close</button>`;
  $('#wp').onclick = () => { stopAudio(); play(text, 'target'); };
  $('#wd').showModal();
  flag(Object.assign({ source: 'tapped' }, info));
}
const dots = rec => { const n = Words.score(rec); return '●'.repeat(n) + '○'.repeat(Words.MAX_SCORE - n); };
$('#wb').onclick = async () => {
  await wordsReady;
  const list = byNewest();
  $('#wl').innerHTML = '<h3>My words</h3>' + (list.length ? '<p class="note">Scores: ● fills up as you get a word right in Drills (coming in a later step). Every word starts empty.</p>' + list.map(x => `<div class="row"><span><b>${esc(x.text)}</b><br><small dir="auto">${esc(x.meaning)}</small><br><small class="sc">Understands <span aria-label="${Words.score(x.understand)} of ${Words.MAX_SCORE}">${dots(x.understand)}</span> · Can say <span aria-label="${Words.score(x.say)} of ${Words.MAX_SCORE}">${dots(x.say)}</span></small>${x.entry ? '' : '<br><small class="sc">Not in the Drills dictionary</small>'}</span><button class="ic" data-id="${esc(x.id)}" aria-label="Hear ${esc(x.text)}">▶</button></div>`).join('') : '<p class="note">Nothing yet. Tap a highlighted word in the tutor\'s sentences, or use How do I say it?</p>') + '<button class="close" onclick="this.closest(\'dialog\').close()">Close</button>';
  $('#wl').querySelectorAll('.ic').forEach(b => b.onclick = () => { stopAudio(); play(W.get(b.dataset.id).text, 'target'); });
  $('#wl').showModal();
};

/* ---------- Rendering ---------- */
function add(el) { const e = $('#empty'); if (e) e.remove(); $('#chat').appendChild(el); $('#chat').scrollTop = 1e9; return el; }
function addUser(t, live) { const d = document.createElement('div'); d.className = 'msg user' + (live ? ' live' : ''); d.textContent = t; return add(d); }
function wrap(text, words) {
  return markWords(text, words).map(p => p.word
    ? `<span class="w" data-w="${esc(p.text)}" data-d="${esc(p.word.d)}" data-m="${esc(p.word.m)}">${esc(p.text)}</span>`
    : esc(p.text)).join('');
}
function addTutor(reply) {
  const box = document.createElement('div'); box.className = 'msg tutor';
  reply.sentences.forEach(s => {
    const d = document.createElement('div'); d.className = 'sent'; d.dataset.target = s.target; d.dataset.native = s.native;
    d.innerHTML = `<div class="line en ${S.en}"><span class="t">${wrap(s.target, s.words)}</span><button class="ic" data-a="target" aria-label="Replay English">▶</button></div>` +
      (s.native ? `<div class="line he ${S.he}" dir="rtl"><span class="t">${esc(s.native)}</span><button class="ic" data-a="native" aria-label="Play Hebrew">▶</button></div>` : '');
    box.appendChild(d);
  });
  add(box);
}
$('#chat').addEventListener('click', e => {
  const b = e.target.closest('.ic');
  if (b) { const s = b.closest('.sent'); stopAudio(); play(s.dataset[b.dataset.a], b.dataset.a); return; }
  const l = e.target.closest('.line');
  if (!l) return;
  if (l.classList.contains('tap') && !l.classList.contains('shown')) { l.classList.add('shown'); return; }
  const w = e.target.closest('.w');
  if (w) openWord({ text: w.dataset.d, form: w.dataset.d, meaning: w.dataset.m, example: w.closest('.sent').dataset.target });
});

/* ---------- Talking with the tutor ---------- */
let msgs = [], busy = false, rec = null, liveEl = null;
const profile = () => ({ level: S.level, words: byNewest().reverse().map(r => ({ w: r.text, m: r.meaning })) });
function ui() {
  const m = rec && rec.mode;
  $('#mic').className = m === 'talk' ? 'rec' : '';
  $('#mic').textContent = m === 'talk' ? 'Tap to send' : busy ? 'Thinking…' : 'Tap to talk';
  $('#say').className = 'pill' + (m === 'say' ? ' rec' : '');
  $('#say').textContent = m === 'say' ? 'Tap when done' : 'How do I say it?';
  $('#mic').disabled = busy || m === 'say';
  $('#say').disabled = busy || m === 'talk';
  const go = $('#go'); if (go) go.disabled = busy || !!m;
}
async function run(task) {
  busy = true; ui();
  try { await task(); }
  catch (e) { toast(e.message); setStatus('Stopped: ' + e.message); }
  busy = false; ui();
}
/* Sends the conversation to the tutor, then shows and speaks its reply. */
async function askTutor() {
  setStatus('Asking ' + ai.name() + '…'); const t0 = Date.now();
  const reply = parseReply(pack, await ai.complete(tutorPrompt(pack, profile(), S), msgs));
  setStatus(ai.label() + ' replied in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  msgs.push({ role: 'assistant', content: replyToHistory(pack, reply) });
  reply.struggled.forEach(x => flag({ text: x.d, form: x.d, meaning: x.m, source: 'model-detected' }));
  addTutor(reply); playAll(reply.sentences);
}
function toggle(mode) {
  if (busy) return;
  if (!canListen) return toast('This browser has no speech recognition. Use Chrome or Edge.');
  if (!ai.hasKey()) return needKey();
  if (rec) { rec.stop(); return; }
  stopAudio();
  if (mode === 'talk') liveEl = addUser('…', true);
  else {
    liveEl = document.createElement('div'); liveEl.className = 'msg say';
    liveEl.innerHTML = '<p class="note">Say it in Hebrew. Tap "Tap when done" when you finish.</p><p class="he-live" dir="rtl" lang="he">…</p>';
    add(liveEl);
  }
  try {
    rec = listen(mode === 'say' ? pack.native : pack.target, {
      onText: t => { (liveEl.querySelector('.he-live') || liveEl).textContent = t || '…'; $('#chat').scrollTop = 1e9; },
      onError: toast,
      onEnd: heard => { rec = null; run(() => mode === 'say' ? sayFlow(heard) : talkFlow(heard)); },
    });
    rec.mode = mode;
  } catch (e) { rec = null; liveEl.remove(); toast(e.message); }
  ui();
}
async function talkFlow(text) {
  if (!text) { liveEl.remove(); return toast("Didn't catch that. Try again."); }
  liveEl.classList.remove('live');
  msgs.push({ role: 'user', content: text });
  try { await askTutor(); }
  catch (e) { msgs.pop(); throw e; } // so the next try does not send the same words twice
}
async function sayFlow(he) {
  const c = liveEl;
  if (!he) { c.remove(); return toast("Didn't catch that. Try again."); }
  c.querySelector('.note').textContent = 'Finding the English…';
  let en;
  try { en = parsePhrase(await ai.complete(howDoISayPrompt(pack), [{ role: 'user', content: he }])); }
  catch (e) { c.remove(); throw e; }
  flag({ text: en, meaning: he, source: 'how-do-I-say-it' });
  c.innerHTML = `<p class="he-live" dir="rtl" lang="he">${esc(he)}</p><div class="sent" data-target="${esc(en)}"><div class="line en"><span class="t big">${esc(en)}</span><button class="ic" data-a="target" aria-label="Play phrase">▶</button></div></div><p class="note">Saved to My words. Now say it in the conversation.</p>`;
  $('#chat').scrollTop = 1e9; play(en, 'target');
}
/* Starting a session (spec 5.3): the tutor opens, using the learner profile. */
function start() {
  if (busy || rec) return;
  if (!ai.hasKey()) return needKey();
  stopAudio();
  msgs.push({ role: 'user', content: '(The learner has just opened the app and is waiting for you.) ' + pack.tutor.opener });
  run(async () => { try { await askTutor(); } catch (e) { msgs.pop(); throw e; } });
}
$('#mic').onclick = () => toggle('talk');
$('#say').onclick = () => toggle('say');
$('#go').onclick = start;

/* ---------- Settings ---------- */
function fill() { $('#pv').value = S.pv; $('#rk').value = S.rk; $('#gm').value = S.gm; $('#gk').value = S.gk; $('#mo').value = S.model; $('#lv').value = S.level; $('#se').value = S.en; $('#sh').value = S.he; $('#sp').value = S.speed; $('#rb').value = S.rateBy; }
$('#sb').onclick = () => { fill(); $('#set').showModal(); };
$('#lv').onchange = e => { const d = LV[e.target.value]; $('#se').value = d[0]; $('#sh').value = d[1]; };
$('#save').onclick = () => {
  S = Object.assign(S, { pv: $('#pv').value, rk: $('#rk').value.trim(), gm: $('#gm').value.trim(), gk: $('#gk').value.trim(), model: $('#mo').value.trim() || S.model, level: $('#lv').value, en: $('#se').value, he: $('#sh').value, rateBy: $('#rb').value });
  sv('sp2_s', S); $('#set').close(); speech.load();
};
$('#sp').onchange = e => { S.speed = e.target.value; sv('sp2_s', S); speech.load(); };
fill();
if (!ai.hasKey()) setTimeout(() => $('#set').showModal(), 300);
