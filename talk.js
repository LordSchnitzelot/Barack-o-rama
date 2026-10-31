/* The conversation screen, shared by Chat and Guide (spec 5): tap to talk, the tutor's sentences
   with subtitles, replay and slower buttons, tap-to-flag, "How do I say it?", and the summary at
   the end of a session (spec 5.13). */
import { tutorPrompt, howDoISayPrompt, parseReply, parsePhrase, replyToHistory, markWords, summaryPrompt, parseSummary, transcriptText } from './tutor.js';
import { listen, canListen } from './services.js';
import { phrasesInText, wordsInPhrase } from './dictionary.js';
import * as store from './store.js';
import { pack, $, esc, S, setStatus, toast, needKey, ai, stopAudio, play, playAll, getDict, link, meaning, flag, byNewest, openWord, weakSpots } from './shell.js';

let mode = 'chat', msgs = [], busy = false, rec = null, liveEl = null;
/* What happened this session, for the summary: words saved, and what the learner said. */
let session = null;
const NAMES = { chat: 'Chat', guide: 'Guide' };

export function openTalk(m) {
  mode = m; msgs = []; session = { flagged: new Map(), turns: 0 };
  stopAudio();
  document.body.dataset.mode = m;
  $('#mode').textContent = NAMES[m];
  $('#chat').innerHTML = `<div class="empty" id="empty">${m === 'guide'
    ? '<p>Guide is a lesson: the tutor picks a subject and runs exercises with you, like a teacher.</p>'
    : '<p>Free conversation. Tap the mic and say hello in English, and tap again when you finish.</p>'}<p>Or let the tutor start:</p><button class="pill" id="go">Start</button></div>`;
  $('#go').onclick = start;
  ui();
}
const isOpen = () => document.body.dataset.view === 'talk';

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
    d.innerHTML = `<div class="line en ${S.en}"><span class="t">${wrap(s.target, s.words)}</span><button class="ic" data-a="target" aria-label="Replay">▶</button><button class="ic" data-a="slow" aria-label="Play slower">🐢</button></div>` +
      (s.native ? `<div class="line he ${S.he}" dir="rtl"><span class="t" lang="${pack.native.code}">${esc(s.native)}</span><button class="ic" data-a="native" aria-label="Play translation">▶</button></div>` : '');
    box.appendChild(d);
  });
  add(box);
}
$('#chat').addEventListener('click', e => {
  const b = e.target.closest('.ic');
  if (b) {
    const s = b.closest('.sent'); stopAudio();
    if (b.dataset.a === 'slow') play(s.dataset.target, 'target', true);
    else play(s.dataset[b.dataset.a], b.dataset.a);
    return;
  }
  const l = e.target.closest('.line');
  if (!l) return;
  /* A hidden subtitle is revealed by tapping it (spec 5.6). */
  if (l.classList.contains('hide') && !l.classList.contains('shown')) { l.classList.add('shown'); return; }
  const w = e.target.closest('.w');
  if (w) openWord({ text: w.dataset.d, form: w.dataset.d, meaning: w.dataset.m, example: w.closest('.sent').dataset.target }, entry => session.flagged.set(entry.id, entry));
});

/* ---------- Talking with the tutor ---------- */
async function profile() {
  return { level: S.level, words: byNewest().reverse().map(r => ({ w: r.text, m: r.meaning })), weakSpots: (await weakSpots()).map(n => n.note) };
}
function ui() {
  const m = rec && rec.mode;
  $('#mic').className = m === 'talk' ? 'rec' : '';
  $('#mic').textContent = m === 'talk' ? 'Tap to send' : busy ? 'Thinking…' : 'Tap to talk';
  $('#say').className = 'pill' + (m === 'say' ? ' rec' : '');
  $('#say').textContent = m === 'say' ? 'Tap when done' : 'How do I say it?';
  $('#mic').disabled = busy || m === 'say';
  $('#say').disabled = busy || m === 'talk';
  $('#end').disabled = busy || !!m;
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
  const reply = parseReply(pack, await ai.complete(tutorPrompt(pack, await profile(), S, mode), msgs));
  setStatus(ai.label() + ' replied in ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
  msgs.push({ role: 'assistant', content: replyToHistory(pack, reply) });
  /* Words the tutor saw the learner struggle with are saved only when the code finds them. */
  reply.struggled.forEach(x => { const e = link(x.d, x.m); if (e) { flag(e, { meaning: meaning(e), source: 'model-detected' }); session.flagged.set(e.id, e); } });
  /* Dictionary phrases ("give up", "take care") are one tappable unit, whatever the AI listed. */
  reply.sentences.forEach(s => { s.words = s.words.concat(phrasesInText(getDict(), s.target, s.words)); });
  if (!isOpen()) return;
  addTutor(reply); playAll(reply.sentences.map(s => s.target));
}
function toggle(kind) {
  if (busy) return;
  if (!canListen) return toast('This browser has no speech recognition. Use Chrome or Edge.');
  if (!ai.hasKey()) return needKey();
  if (rec) { rec.stop(); return; }
  stopAudio();
  if (kind === 'talk') liveEl = addUser('…', true);
  else {
    liveEl = document.createElement('div'); liveEl.className = 'msg say';
    liveEl.innerHTML = '<p class="note">Say it in Hebrew. Tap "Tap when done" when you finish.</p><p class="he-live" dir="rtl" lang="he">…</p>';
    add(liveEl);
  }
  try {
    rec = listen(kind === 'say' ? pack.native : pack.target, {
      onText: t => { (liveEl.querySelector('.he-live') || liveEl).textContent = t || '…'; $('#chat').scrollTop = 1e9; },
      onError: toast,
      onEnd: heard => { rec = null; run(() => kind === 'say' ? sayFlow(heard) : talkFlow(heard)); },
    });
    rec.mode = kind;
  } catch (e) { rec = null; liveEl.remove(); toast(e.message); }
  ui();
}
async function talkFlow(text) {
  if (!text) { liveEl.remove(); return toast("Didn't catch that. Try again."); }
  liveEl.classList.remove('live');
  msgs.push({ role: 'user', content: text });
  session.turns++;
  try { await askTutor(); }
  catch (e) { msgs.pop(); session.turns--; throw e; } // so the next try does not send the same words twice
}
async function sayFlow(he) {
  const c = liveEl;
  if (!he) { c.remove(); return toast("Didn't catch that. Try again."); }
  c.querySelector('.note').textContent = 'Finding the English…';
  let en;
  try { en = parsePhrase(await ai.complete(howDoISayPrompt(pack), [{ role: 'user', content: he }])); }
  catch (e) { c.remove(); throw e; }
  /* The dictionary words inside the answer are saved as "can't say yet" (spec 5.9). */
  const found = wordsInPhrase(getDict(), en, he);
  found.forEach(e => { flag(e, { meaning: meaning(e), example: en, source: 'how-do-I-say-it' }); session.flagged.set(e.id, e); });
  const note = found.length ? 'Saved to My words: ' + found.map(e => e.text).join(', ') + '.' : 'None of its words are in the dictionary, so nothing was saved.';
  c.innerHTML = `<p class="he-live" dir="rtl" lang="he">${esc(he)}</p><div class="sent" data-target="${esc(en)}"><div class="line en"><span class="t big">${esc(en)}</span><button class="ic" data-a="target" aria-label="Play phrase">▶</button><button class="ic" data-a="slow" aria-label="Play slower">🐢</button></div></div><p class="note">${esc(note)} Now say it in the conversation.</p>`;
  $('#chat').scrollTop = 1e9; play(en, 'target');
}
/* Starting a session (spec 5.3): the tutor opens, using the learner profile. */
function start() {
  if (busy || rec) return;
  if (!ai.hasKey()) return needKey();
  stopAudio();
  msgs.push({ role: 'user', content: '(The learner has just opened the app and is waiting for you.) ' + (mode === 'guide' ? pack.guide.opener : pack.tutor.opener) });
  run(async () => { try { await askTutor(); } catch (e) { msgs.pop(); throw e; } });
}
$('#mic').onclick = () => toggle('talk');
$('#say').onclick = () => toggle('say');

/* ---------- End of session (spec 5.13) ----------
   A short summary of new words and things to work on. The AI writes weak-spot notes (spec 8),
   which are kept; the transcript is then discarded. */
export function endTalk(goHome) {
  stopAudio();
  if (rec) { rec.stop(); rec = null; }
  if (!session || !session.turns || !ai.hasKey()) { msgs = []; return goHome(); }
  run(async () => {
    setStatus('Writing your summary…');
    const sum = parseSummary(await ai.complete(summaryPrompt(pack, S), [{ role: 'user', content: transcriptText(pack, msgs) }]));
    const now = Date.now();
    for (const w of sum.weakSpots) await store.putNote({ id: 'n' + now + Math.random().toString(36).slice(2, 6), note: w.note, kind: w.kind, created: now, modified: now });
    await store.trimNotes(MAX_NOTES);
    /* Words the summary names are saved too, when the code finds them in the dictionary. */
    for (const x of sum.words) { const e = link(x.d, x.m); if (e) { flag(e, { meaning: meaning(e), source: 'model-detected' }); session.flagged.set(e.id, e); } }
    showSummary(sum, [...session.flagged.values()]);
    msgs = []; session = null;
    setStatus('Session ended.');
    goHome();
  });
}
/* DEFAULT: how many weak-spot notes are kept; the oldest are dropped. */
const MAX_NOTES = 30;

function showSummary(sum, words) {
  const list = (title, items) => items.length ? `<h3>${title}</h3><ul>${items.join('')}</ul>` : '';
  $('#sum').innerHTML = '<h2>Session summary</h2>' +
    (sum.summary ? `<p>${esc(sum.summary)}</p>` : '') +
    list('Words saved for practice', words.map(e => `<li><b>${esc(e.text)}</b> <span dir="rtl" lang="${pack.native.code}">${esc(meaning(e))}</span></li>`)) +
    list('Better ways to say it', sum.corrections.map(c => `<li><s>${esc(c.said)}</s><br><b>${esc(c.better)}</b></li>`)) +
    list('Things to work on', sum.weakSpots.map(w => `<li>${esc(w.note)} <small class="sc">(${w.kind === 'speaking' ? 'speaking' : 'understanding'})</small></li>`)) +
    '<button class="close" onclick="this.closest(\'dialog\').close()">Done</button>';
  $('#sum').showModal();
}
