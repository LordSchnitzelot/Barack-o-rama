/* The Drills screen (spec 6): spoken translation drills for words and sentences, both ways.
   The next drill is chosen by drills.js (no AI); word answers are checked in code; sentence
   answers are checked by the AI, by meaning. Progress is saved in My words (drill-data.js). */
import * as D from './drills.js';
import * as DD from './drill-data.js';
import { sentenceCheckPrompt, sentenceCheckMessage, parseCheck } from './tutor.js';
import { listen, canListen } from './services.js';
import { pack, $, esc, S, toast, needKey, ai, stopAudio, play, dictReady, data as files, W, wordsReady, saveWord, flag } from './shell.js';
import * as store from './store.js';

const MODES = { mixed: 'Mixed', words: 'Words only', sentences: 'Sentences only', comprehension: 'Comprehension only', speaking: 'Speaking only' };
let data = null, session = null, drill = null, rec = null, hinted = [], score = { right: 0, total: 0 }, missed = [];
let mode = 'mixed';
const box = () => $('#drills');
const side = lang => lang === pack.target.code ? 'target' : 'native';
const langOf = code => code === pack.target.code ? pack.target : pack.native;

/* ---------- Start and end ---------- */
export async function openDrills() {
  stopAudio(); session = null;
  box().innerHTML = `<div class="card"><b>Drills</b><p class="note">About ten spoken drills: new words, words to fix, and a review of words you know. Listen, then tap the mic and answer out loud.</p>
    <label for="dm">What to practice</label><select id="dm">${Object.entries(MODES).map(([k, v]) => `<option value="${k}"${k === mode ? ' selected' : ''}>${v}</option>`).join('')}</select>
    <div class="center"><button class="mic" id="dgo">Start</button></div></div>`;
  $('#dm').onchange = e => { mode = e.target.value; };
  $('#dgo').onclick = start;
}
export function closeDrills() { stopAudio(); if (rec) { rec.stop(); rec = null; } session = null; }

async function start() {
  await dictReady; await wordsReady;
  if (!files.target) return toast('The dictionary did not load. Check your connection and try again.');
  if (!data) data = DD.toDrillsData(files);
  const profile = DD.progressFromWords(data, [...W.values()], await store.getMeta('drills', 0));
  session = D.startSession(data, profile, { mode });
  score = { right: 0, total: 0 }; missed = [];
  next();
}
function next() {
  stopAudio();
  if (!session) return;
  drill = D.nextDrill(session); hinted = [];
  if (!drill) return finish();
  drill.intro ? showIntro() : showDrill();
}
function finish() {
  const list = missed.length ? `<p class="note">To practice again soon:</p><p>${missed.map(esc).join(', ')}</p>` : '';
  box().innerHTML = `<div class="card"><b>Session done</b><p class="verdict ok">${score.right} of ${score.total} right</p>${list}
    <div class="btns"><button class="pill" id="dagain">Another session</button><button class="pill" id="dhome">Home</button></div></div>`;
  $('#dagain').onclick = start;
  $('#dhome').onclick = () => $('#back').click();
  session = null;
}

/* ---------- One drill ---------- */
const target = ref => DD.entryAt(data, ref);
const partner = group => data.dicts[data.native][group] || [];
/* The right answers: the words of the group in the answer's language (spec 6.2). */
function answers() {
  if (drill.type === 'sentence') return [];
  const lang = drill.prompt.lang === data.target ? data.native : data.target;
  return (data.dicts[lang][drill.prompt.group] || []).map(e => e.text);
}
const progress = () => `<p class="progress">${session.history.length} of ${session.size}</p>`;
/* The prompt text follows the subtitle settings: a hidden line is revealed by tapping it (spec 6). */
function promptLine() {
  const p = drill.prompt, hidden = (p.lang === data.target ? S.en : S.he) === 'hide';
  let text = esc(p.text);
  if (drill.type === 'sentence') {
    /* Before recording, any word can be tapped for its meaning (spec 6.6). */
    let rest = p.text, html = '';
    for (const [i, t] of drill.sentence.tags.entries()) {
      const at = rest.indexOf(t.text);
      if (at < 0) continue;
      html += esc(rest.slice(0, at)) + `<span class="tok" data-t="${i}">${esc(t.text)}</span>`;
      rest = rest.slice(at + t.text.length);
    }
    text = html + esc(rest);
  }
  return `<div class="line ${hidden ? 'hide' : ''}"><span class="t prompt ${p.lang === 'he' ? 'he' : ''}" lang="${p.lang}">${text}</span></div>`;
}
function kindText() {
  const to = drill.prompt.lang === data.target ? pack.native.name : pack.target.name;
  return (drill.type === 'sentence' ? 'Say the sentence in ' : 'Say it in ') + to + (drill.bucket === 'weak' ? ' · a word to fix' : drill.bucket === 'new' ? ' · new' : '');
}
function playPrompt(slow) { stopAudio(); play(drill.prompt.speak || drill.prompt.text, side(drill.prompt.lang), slow); }

function showIntro() {
  /* A new word starts with a short intro (spec 6.4): hear it, see the translation, repeat it. */
  const e = target(drill.item), mean = partner(drill.item.group).map(x => x.text).join(', ');
  box().innerHTML = `${progress()}<div class="card"><span class="kind">New word</span>
    <div class="prompt">${esc(e.text)}</div><div class="prompt he" lang="he">${esc(mean)}</div>
    <div class="center"><button class="ic" id="dp" aria-label="Play">▶</button><button class="ic" id="ds" aria-label="Play slower">🐢</button></div>
    <p class="note">Listen, then repeat it out loud.</p>
    <div class="center"><button class="mic" id="dmic">Repeat</button></div><p class="verdict" id="dv"></p>
    <div class="btns"><button class="pill" id="dnext">Now test me</button></div></div>`;
  const say = () => { stopAudio(); play(e.sayAs || e.text, 'target'); };
  $('#dp').onclick = say; $('#ds').onclick = () => { stopAudio(); play(e.sayAs || e.text, 'target', true); };
  $('#dmic').onclick = () => record(pack.target, heard => {
    const ok = D.acceptedForms(e, data.target).includes(D.normalize(heard));
    $('#dv').className = 'verdict ' + (ok ? 'ok' : 'maybe');
    $('#dv').textContent = ok ? '✓ Good' : 'I heard: ' + (heard || 'nothing') + '. Try again, or go on.';
  });
  $('#dnext').onclick = showDrill;
  say();
}

function showDrill() {
  box().innerHTML = `${progress()}<div class="card"><span class="kind">${esc(kindText())}</span>${promptLine()}
    <div class="center"><button class="ic" id="dp" aria-label="Play again">▶</button>${drill.prompt.lang === data.target ? '<button class="ic" id="ds" aria-label="Play slower">🐢</button>' : ''}</div>
    <div class="center"><button class="mic" id="dmic">Tap to answer</button></div>
    <p class="he-live" id="dheard" dir="auto"></p><div id="dres"></div></div>`;
  $('#dp').onclick = () => playPrompt(false);
  const slow = $('#ds'); if (slow) slow.onclick = () => playPrompt(true);
  box().querySelector('.line').onclick = e => {
    const l = e.currentTarget;
    if (l.classList.contains('hide') && !l.classList.contains('shown')) { l.classList.add('shown'); return; }
    const tok = e.target.closest('.tok');
    if (tok) hint(drill.sentence.tags[+tok.dataset.t]);
  };
  $('#dmic').onclick = () => {
    const to = langOf(drill.prompt.lang === data.target ? data.native : data.target);
    record(to, check);
  };
  playPrompt(false);
}

/* A word tapped before answering: its meaning, a play button, and a flag. It then counts as
   not fully known, even if the sentence is said correctly (spec 6.6). */
function hint(tag) {
  if (!hinted.includes(tag)) hinted.push(tag);
  const lang = drill.sentence.lang, e = data.dicts[lang][tag.group][tag.word];
  const other = (data.dicts[lang === data.target ? data.native : data.target][tag.group] || []).map(x => x.text).join(', ');
  const t = DD.entryAt(data, { group: tag.group, word: lang === data.target ? tag.word : 0 });
  const d = $('#wd');
  d.innerHTML = `<h3>${esc(e.text)}</h3><p dir="auto" class="mean">${esc(other)}</p><button class="pill" id="wp">▶ Hear it</button><p class="note" style="margin-top:12px">Saved to My words for practice.</p><button class="close" onclick="this.closest('dialog').close()">Close</button>`;
  $('#wp').onclick = () => { stopAudio(); play(e.sayAs || e.text, side(lang)); };
  d.showModal();
  if (t) flag({ id: t.id, text: t.text }, { meaning: partner(tag.group).map(x => x.text)[0] || '', example: drill.sentence.text, source: 'tapped' });
  box().querySelector(`.tok[data-t="${drill.sentence.tags.indexOf(tag)}"]`).classList.add('hinted');
}

/* Push-to-talk (spec 6.6): recording starts only when the mic is tapped, and stops on the next tap. */
function record(lang, done) {
  if (!canListen) return toast('This browser has no speech recognition. Use Chrome or Edge.');
  const mic = $('#dmic');
  if (rec) { rec.stop(); return; }
  stopAudio();
  const before = mic.textContent;
  mic.classList.add('rec'); mic.textContent = 'Tap when done';
  const live = $('#dheard');
  try {
    rec = listen(lang, {
      onText: t => { if (live) live.textContent = t; },
      onError: toast,
      onEnd: heard => { rec = null; mic.classList.remove('rec'); mic.textContent = before; done(heard); },
    });
  } catch (e) { rec = null; mic.classList.remove('rec'); mic.textContent = before; toast(e.message); }
}

/* ---------- Checking and feedback (spec 6.2, 6.7) ---------- */
async function check(heard) {
  if (!heard) return toast("Didn't catch that. Try again.");
  if (drill.type === 'word') {
    const r = D.checkWordAnswer(data, drill.prompt, heard);
    if (r.result === 'maybe') return didYouMean(r.closest, heard);
    return done(r.result === 'right', { matched: r.matched });
  }
  if (!ai.hasKey()) return needKey();
  const res = $('#dres'); res.innerHTML = '<p class="note">Checking…</p>'; $('#dmic').disabled = true;
  try {
    const answerLang = drill.prompt.lang === data.target ? pack.native.name : pack.target.name;
    const c = parseCheck(await ai.complete(sentenceCheckPrompt(pack), [{ role: 'user', content: sentenceCheckMessage(drill.prompt.text, heard, answerLang) }]));
    done(c.correct, { hinted, better: c.better, note: c.note });
  } catch (e) { res.innerHTML = ''; $('#dmic').disabled = false; toast(e.message); }
}
/* Likely misheard: the closest option and two buttons (spec 6.7). */
function didYouMean(closest, heard) {
  $('#dres').innerHTML = `<p class="verdict maybe">Did you mean "${esc(closest)}"?</p><div class="btns"><button class="pill" id="dyes">Yes, that's what I said</button><button class="pill" id="dno">No, retry</button></div>`;
  $('#dyes').onclick = () => {
    const r = D.checkWordAnswer(data, drill.prompt, closest);
    done(true, { matched: r.matched });
  };
  $('#dno').onclick = () => { $('#dres').innerHTML = ''; $('#dheard').textContent = ''; };
}
async function done(correct, info) {
  const t = Date.now();
  D.recordAnswer(session, drill, Object.assign({ correct }, info));
  score.total++; if (correct) score.right++;
  if (!correct) missed.push(drill.type === 'word' ? target(drill.item).text : drill.prompt.text);
  /* Save the words whose progress changed to My words. */
  const keys = Object.keys(session.profile.progress).filter(k => Object.values(session.profile.progress[k]).some(r => r && r.modified >= t));
  const meaningOf = e => partner(data.where[e.id].group).map(x => x.text)[0] || '';
  for (const r of DD.wordsFromProgress(data, session.profile, W, keys, meaningOf, t)) await saveWord(r);
  store.setMeta('drills', session.profile.count);

  const right = drill.type === 'word' ? answers() : [info.better].filter(Boolean);
  const answerSide = drill.prompt.lang === data.target ? 'native' : 'target';
  $('#dmic').disabled = true;
  $('#dres').innerHTML = (correct
    ? `<p class="verdict ok">✓ Right</p>${right.length && drill.type === 'word' ? `<p class="note">${esc(right.join(', '))}</p>` : ''}`
    : `<p class="verdict bad">Not quite</p>${info.note ? `<p class="note">${esc(info.note)}</p>` : ''}<p class="prompt ${answerSide === 'native' ? 'he' : ''}" dir="auto">${esc(right.join(', '))}</p><div class="center"><button class="ic" id="dpc" aria-label="Play the right answer">▶</button></div>`) +
    '<div class="btns"><button class="pill" id="dnext">Next</button></div>';
  /* A real mistake: show and play the correct version (spec 6.7). */
  if (!correct && right.length) { const say = () => { stopAudio(); play(right[0], answerSide); }; $('#dpc').onclick = say; say(); }
  $('#dnext').onclick = next;
}
