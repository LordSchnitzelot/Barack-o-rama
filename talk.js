/* The conversation screen, shared by Chat and Guide (spec 5): tap to talk, the tutor's sentences
   with subtitles, replay and slower buttons, tap-to-flag, "How do I say it?", and the summary at
   the end of a session (spec 5.13). */
import { tutorPrompt, howDoISayPrompt, parseReply, parsePhrase, replyToHistory, markWords, summaryPrompt, parseSummary, transcriptText } from './tutor.js';
import { listen, canListen } from './services.js';
import { phrasesInText, wordsInPhrase } from './dictionary.js';
import { t } from './strings.js';
import * as store from './store.js';
import { pack, $, esc, S, setStatus, toast, needKey, ai, stopAudio, play, playAll, getDict, link, meaning, flag, byNewest, openWord, weakSpots } from './shell.js';

let mode = 'chat', msgs = [], busy = 0, rec = null, liveEl = null;
/* What happened this session, for the summary: words saved, and what the learner said. */
let session = null;
/* Counts sessions. Work still running when a session ends (a reply on its way, the microphone)
   checks this and is dropped, so nothing arrives into the next screen. */
let talkId = 0;
const T = pack.target, N = pack.native;

export function openTalk(m) {
  mode = m; msgs = []; session = { flagged: new Map(), turns: 0 }; talkId++;
  stopAudio();
  document.body.dataset.mode = m;
  showEmpty();
  ui();
}
function showEmpty() {
  $('#mode').textContent = t(mode === 'guide' ? 'talk.guide' : 'talk.chat');
  $('#chat').innerHTML = `<div class="empty" id="empty"><p>${esc(t(mode === 'guide' ? 'talk.guideIntro' : 'talk.chatIntro'))}</p><p>${esc(t('talk.orStart'))}</p><button class="pill" id="go">${esc(t('talk.start'))}</button></div>`;
  $('#go').onclick = start;
}
const isOpen = () => document.body.dataset.view === 'talk';
/* After the interface language changes: the texts that are not part of the conversation. */
export function relabelTalk() {
  if (!session) return;
  $('#mode').textContent = t(mode === 'guide' ? 'talk.guide' : 'talk.chat');
  if ($('#empty')) showEmpty();
  ui();
}

/* ---------- Rendering ---------- */
function add(el) { const e = $('#empty'); if (e) e.remove(); $('#chat').appendChild(el); $('#chat').scrollTop = 1e9; return el; }
function addUser(text, live) { const d = document.createElement('div'); d.className = 'msg user' + (live ? ' live' : ''); d.dir = 'auto'; d.lang = T.code; d.textContent = text; return add(d); }
function wrap(text, words) {
  return markWords(text, words).map(p => p.word
    ? `<span class="w" data-w="${esc(p.text)}" data-d="${esc(p.word.d)}" data-m="${esc(p.word.m)}">${esc(p.text)}</span>`
    : esc(p.text)).join('');
}
function addTutor(reply) {
  const box = document.createElement('div'); box.className = 'msg tutor';
  reply.sentences.forEach(s => {
    const d = document.createElement('div'); d.className = 'sent'; d.dataset.target = s.target; d.dataset.native = s.native;
    d.innerHTML = `<div class="line en ${S.en}" dir="${T.dir}"><span class="t" lang="${T.code}">${wrap(s.target, s.words)}</span><button class="ic" data-a="target" aria-label="${esc(t('talk.replay'))}">▶</button><button class="ic" data-a="slow" aria-label="${esc(t('talk.slower'))}">🐢</button></div>` +
      (s.native ? `<div class="line he ${S.he}" dir="${N.dir}"><span class="t" lang="${N.code}">${esc(s.native)}</span><button class="ic" data-a="native" aria-label="${esc(t('talk.playNative'))}">▶</button></div>` : '');
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
  if (w) { const s = session; openWord({ text: w.dataset.d, form: w.dataset.d, meaning: w.dataset.m, example: w.closest('.sent').dataset.target }, entry => s && s.flagged.set(entry.id, entry)); }
});

/* ---------- Talking with the tutor ---------- */
async function profile() {
  return { level: S.level, words: byNewest().reverse().map(r => ({ w: r.text, m: r.meaning })), weakSpots: (await weakSpots()).map(n => n.note) };
}
function ui() {
  const m = rec && rec.mode;
  $('#mic').className = m === 'talk' ? 'rec' : '';
  $('#mic').textContent = t(m === 'talk' ? 'talk.send' : busy ? 'talk.thinking' : 'talk.talk');
  $('#say').className = 'pill' + (m === 'say' ? ' rec' : '');
  $('#say').textContent = t(m === 'say' ? 'talk.sayDone' : 'talk.say');
  $('#mic').disabled = !!busy || m === 'say';
  $('#say').disabled = !!busy || m === 'talk';
  $('#end').disabled = !!busy || !!m;
  const go = $('#go'); if (go) go.disabled = !!busy || !!m;
}
/* Runs one step of the conversation. busy counts the steps running, so the buttons wait for them.
   A problem is shown only if its session is still open. */
async function run(task) {
  const id = talkId;
  busy++; ui();
  try { await task(); }
  catch (e) { if (id === talkId) { toast(e.message); setStatus(t('talk.stopped', { e: e.message })); } }
  busy--; ui();
}
/* Sends the conversation to the tutor, then shows and speaks its reply. */
async function askTutor(id) {
  setStatus(t('talk.asking', { ai: ai.name() })); const t0 = Date.now();
  const text = await ai.complete(tutorPrompt(pack, await profile(), S, mode), msgs);
  if (id !== talkId) return; // the session ended while the tutor was answering
  const reply = parseReply(pack, text);
  setStatus(t('talk.replied', { ai: ai.label(), s: ((Date.now() - t0) / 1000).toFixed(1) }));
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
  if (!canListen) return toast(t('common.noMic'));
  if (!ai.hasKey()) return needKey();
  if (rec) { rec.stop(); return; }
  stopAudio();
  if (kind === 'talk') liveEl = addUser('…', true);
  else {
    liveEl = document.createElement('div'); liveEl.className = 'msg say';
    liveEl.innerHTML = `<p class="note">${esc(t('talk.sayPrompt', { done: t('talk.sayDone') }))}</p><p class="he-live" dir="${N.dir}" lang="${N.code}">…</p>`;
    add(liveEl);
  }
  const id = talkId;
  try {
    rec = listen(kind === 'say' ? N : T, {
      onText: text => { (liveEl.querySelector('.he-live') || liveEl).textContent = text || '…'; $('#chat').scrollTop = 1e9; },
      onError: toast,
      onEnd: heard => { rec = null; if (id !== talkId) return; run(() => kind === 'say' ? sayFlow(heard, id) : talkFlow(heard, id)); },
    });
    rec.mode = kind;
  } catch (e) { rec = null; liveEl.remove(); toast(e.message); }
  ui();
}
async function talkFlow(text, id) {
  if (!text) { liveEl.remove(); return toast(t('common.notCaught')); }
  liveEl.classList.remove('live');
  msgs.push({ role: 'user', content: text });
  session.turns++;
  try { await askTutor(id); }
  catch (e) { if (id === talkId) { msgs.pop(); session.turns--; } throw e; } // so the next try does not send the same words twice
}
async function sayFlow(he, id) {
  const c = liveEl;
  if (!he) { c.remove(); return toast(t('common.notCaught')); }
  c.querySelector('.note').textContent = t('talk.finding');
  let en;
  try { en = parsePhrase(await ai.complete(howDoISayPrompt(pack), [{ role: 'user', content: he }])); }
  catch (e) { c.remove(); throw e; }
  if (id !== talkId) return;
  /* The dictionary words inside the answer are saved as "can't say yet" (spec 5.9). */
  const found = wordsInPhrase(getDict(), en, he);
  found.forEach(e => { flag(e, { meaning: meaning(e), example: en, source: 'how-do-I-say-it' }); session.flagged.set(e.id, e); });
  const note = found.length ? t('talk.savedList', { list: found.map(e => e.text).join(', ') }) : t('talk.nothingSaved');
  c.innerHTML = `<p class="he-live" dir="${N.dir}" lang="${N.code}">${esc(he)}</p><div class="sent" data-target="${esc(en)}"><div class="line en" dir="${T.dir}"><span class="t big" lang="${T.code}">${esc(en)}</span><button class="ic" data-a="target" aria-label="${esc(t('talk.playPhrase'))}">▶</button><button class="ic" data-a="slow" aria-label="${esc(t('talk.slower'))}">🐢</button></div></div><p class="note">${esc(note + ' ' + t('talk.nowSay'))}</p>`;
  $('#chat').scrollTop = 1e9; play(en, 'target');
}
/* Starting a session (spec 5.3): the tutor opens, using the learner profile. */
function start() {
  if (busy || rec) return;
  if (!ai.hasKey()) return needKey();
  stopAudio();
  const id = talkId;
  msgs.push({ role: 'user', content: '(The learner has just opened the app and is waiting for you.) ' + (mode === 'guide' ? pack.guide.opener : pack.tutor.opener) });
  run(async () => { try { await askTutor(id); } catch (e) { if (id === talkId) msgs.pop(); throw e; } });
}
$('#mic').onclick = () => toggle('talk');
$('#say').onclick = () => toggle('say');

/* ---------- End of session (spec 5.13) ----------
   A short summary of new words and things to work on. The AI writes weak-spot notes (spec 8),
   which are kept; the transcript is then discarded. Leaving always works: if the summary cannot
   be written (no internet, a problem with the AI), the words are already saved and the app goes
   home with a message. */
export function endTalk(goHome) {
  stopAudio();
  if (rec) { rec.cancel(); rec = null; if (liveEl) liveEl.remove(); }
  const s = session, history = msgs;
  session = null; msgs = []; talkId++;
  ui();
  if (!s || !s.turns || !ai.hasKey()) return goHome();
  busy++; ui();
  setStatus(t('talk.summarizing'));
  (async () => {
    const sum = parseSummary(await ai.complete(summaryPrompt(pack, S), [{ role: 'user', content: transcriptText(pack, history) }]));
    const now = Date.now();
    for (const w of sum.weakSpots) await store.putNote({ id: 'n' + now + Math.random().toString(36).slice(2, 6), note: w.note, kind: w.kind, created: now, modified: now });
    await store.trimNotes(MAX_NOTES);
    /* Words the summary names are saved too, when the code finds them in the dictionary. */
    for (const x of sum.words) { const e = link(x.d, x.m); if (e) { flag(e, { meaning: meaning(e), source: 'model-detected' }); s.flagged.set(e.id, e); } }
    showSummary(sum, [...s.flagged.values()]);
    setStatus(t('talk.ended'));
  })().catch(e => { toast(e.message); setStatus(t('talk.stopped', { e: e.message })); })
    .finally(() => { busy--; ui(); if (isOpen()) goHome(); });
}
/* DEFAULT: how many weak-spot notes are kept; the oldest are dropped. */
const MAX_NOTES = 30;

function showSummary(sum, words) {
  const list = (title, items) => items.length ? `<h3>${esc(title)}</h3><ul>${items.join('')}</ul>` : '';
  $('#sum').innerHTML = `<h2>${esc(t('sum.title'))}</h2>` +
    (sum.summary ? `<p dir="${T.dir}" lang="${T.code}">${esc(sum.summary)}</p>` : '') +
    list(t('sum.words'), words.map(e => `<li><b lang="${T.code}" dir="${T.dir}">${esc(e.text)}</b> <span dir="${N.dir}" lang="${N.code}">${esc(meaning(e))}</span></li>`)) +
    list(t('sum.better'), sum.corrections.map(c => `<li dir="${T.dir}" lang="${T.code}"><s>${esc(c.said)}</s><br><b>${esc(c.better)}</b></li>`)) +
    list(t('sum.work'), sum.weakSpots.map(w => `<li><span dir="${T.dir}" lang="${T.code}">${esc(w.note)}</span> <small class="sc">(${esc(t(w.kind === 'speaking' ? 'sum.speaking' : 'sum.understanding'))})</small></li>`)) +
    `<button class="close" onclick="this.closest('dialog').close()">${esc(t('sum.done'))}</button>`;
  $('#sum').showModal();
}
