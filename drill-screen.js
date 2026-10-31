/* The Drills screen (spec 6): spoken translation drills for words and sentences, both ways.
   The next drill is chosen by drills.js (no AI); word answers are checked in code; sentence
   answers are checked by the AI, by meaning. Progress is saved in My words (drill-data.js). */
import * as D from './drills.js';
import * as DD from './drill-data.js';
import { sentenceCheckPrompt, sentenceCheckMessage, parseCheck } from './tutor.js';
import { listen, canListen } from './services.js';
import { pack, $, esc, attrs, S, saveSettings, toast, needKey, ai, stopAudio, play, dictReady, data as files, W, wordsReady, saveWord, flag } from './shell.js';
import { t, langName } from './strings.js';
import * as store from './store.js';

let data = null, session = null, drill = null, rec = null, hinted = [], score = { right: 0, total: 0 }, missed = [];
/* What to practice (spec 6.1): Mixed by default; the last choice is remembered. */
let mode = D.MODES.includes(S.drillMode) ? S.drillMode : 'mixed';
const box = () => $('#drills');
const side = lang => lang === pack.target.code ? 'target' : 'native';
const langOf = code => code === pack.target.code ? pack.target : pack.native;

/* ---------- Start and end ---------- */
export async function openDrills() {
  stopAudio(); session = null;
  box().innerHTML = `<div class="card"><b>${esc(t('drills.title'))}</b><p class="note">${esc(t('drills.intro'))}</p>
    <label for="dm">${esc(t('drills.what'))}</label><select id="dm">${D.MODES.map(k => `<option value="${k}"${k === mode ? ' selected' : ''}>${esc(t('drills.' + k))}</option>`).join('')}</select>
    <div class="center"><button class="mic" id="dgo">${esc(t('drills.start'))}</button></div></div>`;
  $('#dm').onchange = e => { mode = e.target.value; saveSettings({ drillMode: mode }); };
  $('#dgo').onclick = start;
}
/* Leaving Drills: a recording still running is thrown away, so it cannot answer a drill that is gone. */
export function closeDrills() { stopAudio(); if (rec) { rec.cancel(); rec = null; } session = null; }
/* After the interface language changes: redraws the start card (a drill in progress keeps its texts
   until the next drill). */
export function relabelDrills() { if (!session && document.body.dataset.view === 'drills' && $('#dgo')) openDrills(); }

async function start() {
  await dictReady; await wordsReady;
  if (!files.target) return toast(t('drills.noDict'));
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
  const list = missed.length ? `<p class="note">${esc(t('drills.again'))}</p><p>${missed.map(m => `<span ${attrs(m.lang)}>${esc(m.text)}</span>`).join(', ')}</p>` : '';
  box().innerHTML = `<div class="card"><b>${esc(t('drills.done'))}</b><p class="verdict ok">${esc(t('drills.score', { right: score.right, total: score.total }))}</p>${list}
    <div class="btns"><button class="pill" id="dagain">${esc(t('drills.another'))}</button><button class="pill" id="dhome">${esc(t('drills.home'))}</button></div></div>`;
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
const progress = () => `<p class="progress">${esc(t('drills.progress', { i: session.history.length, n: session.size }))}</p>`;
/* The prompt text follows the subtitle settings: a hidden line is revealed by tapping it (spec 6). */
function promptLine() {
  const p = drill.prompt, hidden = (p.lang === data.target ? S.en : S.he) === 'hide';
  let text = esc(p.text);
  if (drill.type === 'sentence') {
    /* Before recording, any word can be tapped for its meaning (spec 6.6). */
    let rest = p.text, html = '';
    for (const [i, tag] of drill.sentence.tags.entries()) {
      const at = rest.indexOf(tag.text);
      if (at < 0) continue;
      html += esc(rest.slice(0, at)) + `<span class="tok" data-tag="${i}">${esc(tag.text)}</span>`;
      rest = rest.slice(at + tag.text.length);
    }
    text = html + esc(rest);
  }
  return `<div class="line ${hidden ? 'hide' : ''}" ${attrs(p.lang)}><span class="t prompt">${text}</span></div>`;
}
function kindText() {
  const to = langName(drill.prompt.lang === data.target ? data.native : data.target);
  return t(drill.type === 'sentence' ? 'drills.saySentence' : 'drills.sayWord', { lang: to }) + (drill.bucket === 'weak' ? t('drills.weak') : drill.bucket === 'new' ? t('drills.new') : '');
}
function playPrompt(slow) { stopAudio(); play(drill.prompt.speak || drill.prompt.text, side(drill.prompt.lang), slow); }

function showIntro() {
  /* A new word starts with a short intro (spec 6.4): hear it, see the translation, repeat it. */
  const e = target(drill.item), mean = partner(drill.item.group).map(x => x.text).join(', ');
  box().innerHTML = `${progress()}<div class="card"><span class="kind">${esc(t('drills.newWord'))}</span>
    <p class="prompt" ${attrs(data.target)}>${esc(e.text)}</p><p class="prompt" ${attrs(data.native)}>${esc(mean)}</p>
    <div class="center"><button class="ic" id="dp" aria-label="${esc(t('drills.play'))}">▶</button><button class="ic" id="ds" aria-label="${esc(t('talk.slower'))}">🐢</button></div>
    <p class="note">${esc(t('drills.listenRepeat'))}</p>
    <div class="center"><button class="mic" id="dmic">${esc(t('drills.repeat'))}</button></div><p class="verdict" id="dv" dir="auto"></p>
    <div class="btns"><button class="pill" id="dnext">${esc(t('drills.testMe'))}</button></div></div>`;
  const say = () => { stopAudio(); play(e.sayAs || e.text, 'target'); };
  $('#dp').onclick = say; $('#ds').onclick = () => { stopAudio(); play(e.sayAs || e.text, 'target', true); };
  $('#dmic').onclick = () => record(pack.target, heard => {
    const ok = D.acceptedForms(e, data.target).includes(D.normalize(heard));
    $('#dv').className = 'verdict ' + (ok ? 'ok' : 'maybe');
    $('#dv').textContent = ok ? t('drills.good') : t('drills.heard', { t: heard || t('drills.nothing') });
  });
  $('#dnext').onclick = showDrill;
  say();
}

function showDrill() {
  const answerLang = drill.prompt.lang === data.target ? data.native : data.target;
  box().innerHTML = `${progress()}<div class="card"><span class="kind">${esc(kindText())}</span>${promptLine()}
    <div class="center"><button class="ic" id="dp" aria-label="${esc(t('drills.playAgain'))}">▶</button>${drill.prompt.lang === data.target ? `<button class="ic" id="ds" aria-label="${esc(t('talk.slower'))}">🐢</button>` : ''}</div>
    <div class="center"><button class="mic" id="dmic">${esc(t('drills.answer'))}</button></div>
    <p class="he-live" id="dheard" ${attrs(answerLang)}></p><div id="dres"></div></div>`;
  $('#dp').onclick = () => playPrompt(false);
  const slow = $('#ds'); if (slow) slow.onclick = () => playPrompt(true);
  box().querySelector('.line').onclick = e => {
    const l = e.currentTarget;
    if (l.classList.contains('hide') && !l.classList.contains('shown')) { l.classList.add('shown'); return; }
    const tok = e.target.closest('.tok');
    if (tok) hint(drill.sentence.tags[+tok.dataset.tag]);
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
  const word = DD.entryAt(data, { group: tag.group, word: lang === data.target ? tag.word : 0 });
  const d = $('#wd');
  const otherLang = lang === data.target ? data.native : data.target;
  d.innerHTML = `<h3 ${attrs(lang)}>${esc(e.text)}</h3><p ${attrs(otherLang)} class="mean">${esc(other)}</p><button class="pill" id="wp">${esc(t('common.hear'))}</button><p class="note" style="margin-top:12px">${esc(t('word.saved'))}</p><button class="close" onclick="this.closest('dialog').close()">${esc(t('common.close'))}</button>`;
  $('#wp').onclick = () => { stopAudio(); play(e.sayAs || e.text, side(lang)); };
  d.showModal();
  if (word) flag({ id: word.id, text: word.text }, { meaning: partner(tag.group).map(x => x.text)[0] || '', example: drill.sentence.text, source: 'tapped' });
  box().querySelector(`.tok[data-tag="${drill.sentence.tags.indexOf(tag)}"]`).classList.add('hinted');
}

/* Push-to-talk (spec 6.6): recording starts only when the mic is tapped, and stops on the next tap. */
function record(lang, done) {
  if (!canListen) return toast(t('common.noMic'));
  const mic = $('#dmic');
  if (rec) { rec.stop(); return; }
  stopAudio();
  const before = mic.textContent;
  mic.classList.add('rec'); mic.textContent = t('talk.sayDone');
  const live = $('#dheard');
  try {
    rec = listen(lang, {
      onText: text => { if (live) live.textContent = text; },
      onError: toast,
      onEnd: heard => { rec = null; mic.classList.remove('rec'); mic.textContent = before; done(heard); },
    });
  } catch (e) { rec = null; mic.classList.remove('rec'); mic.textContent = before; toast(e.message); }
}

/* ---------- Checking and feedback (spec 6.2, 6.7) ---------- */
async function check(heard) {
  if (drill.answered) return;
  if (!heard) return toast(t('common.notCaught'));
  if (drill.type === 'word') {
    const r = D.checkWordAnswer(data, drill.prompt, heard);
    if (r.result === 'maybe') return didYouMean(r.closest, heard);
    return done(r.result === 'right', { matched: r.matched });
  }
  if (!ai.hasKey()) return needKey();
  const res = $('#dres'); res.innerHTML = `<p class="note">${esc(t('drills.checking'))}</p>`; $('#dmic').disabled = true;
  const asked = drill;
  try {
    const answerLang = drill.prompt.lang === data.target ? pack.native.name : pack.target.name;
    const c = parseCheck(await ai.complete(sentenceCheckPrompt(pack), [{ role: 'user', content: sentenceCheckMessage(drill.prompt.text, heard, answerLang) }]));
    if (asked !== drill || !session) return; // the learner left while the answer was checked
    done(c.correct, { hinted, better: c.better, note: c.note });
  } catch (e) { if (asked !== drill || !session) return; res.innerHTML = ''; $('#dmic').disabled = false; toast(e.message); }
}
/* Likely misheard: the closest option and two buttons (spec 6.7). */
function didYouMean(closest, heard) {
  $('#dres').innerHTML = `<p class="verdict maybe">${esc(t('drills.didYouMean', { w: closest }))}</p><div class="btns"><button class="pill" id="dyes">${esc(t('drills.yes'))}</button><button class="pill" id="dno">${esc(t('drills.retry'))}</button></div>`;
  $('#dyes').onclick = () => {
    const r = D.checkWordAnswer(data, drill.prompt, closest);
    done(true, { matched: r.matched });
  };
  $('#dno').onclick = () => { $('#dres').innerHTML = ''; $('#dheard').textContent = ''; };
}
async function done(correct, info) {
  const now = Date.now(), s = session, d = drill;
  if (!s || d.answered) return; // one answer per drill, even if a button is tapped twice
  d.answered = true;
  D.recordAnswer(s, d, Object.assign({ correct }, info));
  score.total++; if (correct) score.right++;
  if (!correct) missed.push(d.type === 'word' ? { text: target(d.item).text, lang: data.target } : { text: d.prompt.text, lang: d.prompt.lang });
  /* Save the words whose progress changed to My words. */
  const keys = Object.keys(s.profile.progress).filter(k => Object.values(s.profile.progress[k]).some(r => r && r.modified >= now));
  const meaningOf = e => partner(data.where[e.id].group).map(x => x.text)[0] || '';
  for (const r of DD.wordsFromProgress(data, s.profile, W, keys, meaningOf, now)) await saveWord(r);
  store.setMeta('drills', s.profile.count);
  if (s !== session || d !== drill) return; // the learner left while the answer was saved

  const right = drill.type === 'word' ? answers() : [info.better].filter(Boolean);
  const answerSide = drill.prompt.lang === data.target ? 'native' : 'target';
  const answerLang = answerSide === 'native' ? data.native : data.target;
  $('#dmic').disabled = true;
  $('#dres').innerHTML = (correct
    ? `<p class="verdict ok">${esc(t('drills.right'))}</p>${right.length && drill.type === 'word' ? `<p class="note" ${attrs(answerLang)}>${esc(right.join(', '))}</p>` : ''}`
    : `<p class="verdict bad">${esc(t('drills.wrong'))}</p>${info.note ? `<p class="note" ${attrs(data.target)}>${esc(info.note)}</p>` : ''}` +
      (right.length ? `<p class="prompt" ${attrs(answerLang)}>${esc(right.join(', '))}</p><div class="center"><button class="ic" id="dpc" aria-label="${esc(t('drills.playRight'))}">▶</button></div>` : '')) +
    `<div class="btns"><button class="pill" id="dnext">${esc(t('drills.next'))}</button></div>`;
  /* A real mistake: show and play the correct version (spec 6.7). */
  if (!correct && right.length) { const say = () => { stopAudio(); play(right[0], answerSide); }; $('#dpc').onclick = say; say(); }
  $('#dnext').onclick = next;
}
