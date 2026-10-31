/* The app's entry: the home screen with its three modes (spec 4), Settings and My words.
   The screens live in talk.js (Chat and Guide) and drill-screen.js (Drills); what they share
   lives in shell.js. */
import { $, esc, S, saveSettings, speech, stopAudio, play, ai, wordsReady, byNewest, W } from './shell.js';
import * as Words from './words.js';
import { openTalk, endTalk } from './talk.js';
import { openDrills, closeDrills } from './drill-screen.js';

speech.load();

/* ---------- Moving between screens ---------- */
const TITLES = { home: 'Speaking', talk: 'Talk', drills: 'Drills' };
function show(view) { document.body.dataset.view = view; $('#title').textContent = TITLES[view]; }
function goHome() { stopAudio(); closeDrills(); show('home'); }
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
  const m = b.dataset.go;
  if (m === 'drills') { show('drills'); openDrills(); }
  else { show('talk'); openTalk(m); }
});
$('#back').onclick = () => document.body.dataset.view === 'talk' ? endTalk(goHome) : goHome();
$('#end').onclick = () => endTalk(goHome);

/* ---------- My words ---------- */
const dots = rec => { const n = Words.score(rec); return '●'.repeat(n) + '○'.repeat(Words.MAX_SCORE - n); };
$('#wb').onclick = async () => {
  await wordsReady;
  const list = byNewest();
  $('#wl').innerHTML = '<h3>My words</h3>' + (list.length
    ? '<p class="note">● fills up each time you get the word right in Drills. Words you miss go back to empty and come up more often.</p>' +
      list.map(x => `<div class="row"><span><b>${esc(x.text)}</b><br><small dir="auto">${esc(x.meaning)}</small><br><small class="sc">Understands <span aria-label="${Words.score(x.understand)} of ${Words.MAX_SCORE}">${dots(x.understand)}</span> · Can say <span aria-label="${Words.score(x.say)} of ${Words.MAX_SCORE}">${dots(x.say)}</span></small></span><button class="ic" data-id="${esc(x.id)}" aria-label="Hear ${esc(x.text)}">▶</button></div>`).join('')
    : '<p class="note">Nothing yet. Tap a highlighted word in the tutor\'s sentences, use How do I say it?, or practice in Drills. Only words in the dictionary are saved.</p>') +
    '<button class="close" onclick="this.closest(\'dialog\').close()">Close</button>';
  $('#wl').querySelectorAll('.ic').forEach(b => b.onclick = () => { stopAudio(); play(W.get(b.dataset.id).text, 'target'); });
  $('#wl').showModal();
};

/* ---------- Settings (spec 9) ---------- */
const FIELDS = { pv: 'pv', rk: 'rk', gm: 'gm', gk: 'gk', mo: 'model', lv: 'level', se: 'en', sh: 'he', co: 'corrections', sp2: 'speed', rb: 'rateBy' };
function fill() { for (const [id, k] of Object.entries(FIELDS)) $('#' + id).value = S[k]; $('#sp').value = S.speed; }
$('#sb').onclick = () => { fill(); $('#set').showModal(); };
$('#save').onclick = () => {
  const c = {};
  for (const [id, k] of Object.entries(FIELDS)) c[k] = $('#' + id).value.trim();
  c.model = c.model || S.model;
  saveSettings(c); fill(); $('#set').close(); speech.load();
};
$('#sp').onchange = e => { saveSettings({ speed: e.target.value }); speech.load(); };
fill();
if (!ai.hasKey()) setTimeout(() => $('#set').showModal(), 300);
