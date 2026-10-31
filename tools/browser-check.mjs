/* Clicks through the whole app in a real (headless) browser, with a pretend AI and a pretend
   microphone, so every screen can be checked without API keys or speaking.
   This is a tool for whoever works on the code; the app itself does not use it.

   Needs Node and Playwright with Chromium (npm install playwright, then npx playwright install
   chromium). Run from the project folder:
     node tools/browser-check.mjs            all checks
     node tools/browser-check.mjs --shots    also saves screenshots in tools/shots/

   What is faked:
   - The microphone: speech recognition "hears" whatever the test sets in window.__say.
   - The AI: requests to Groq get ready-made replies, picked by what the request asks for.
   - Phonon is replaced by a stand-in that makes a short beep for each sentence after a short
     wait, so the app's audio player is tested without downloading the real model. */
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { extname, join, normalize as normPath } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHOTS = process.argv.includes('--shots');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

/* ---------- A small static server for the project folder ---------- */
function serve() {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = normPath(join(ROOT, path.endsWith('/') ? path + 'index.html' : path));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
    } catch (e) { res.writeHead(404).end('not found'); }
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok(server)));
}

/* ---------- The pretend AI ---------- */
const tutorReply = {
  sentences: [
    { en: 'Hello! It is nice to meet you.', he: 'שלום! נעים להכיר אותך.', words: [{ w: 'nice', d: 'nice', m: 'נֶחְמָד' }, { w: 'meet', d: 'to meet', m: 'לִפְגּוֹשׁ' }] },
    { en: 'Did you give up coffee?', he: 'ויתרת על קפה?', words: [{ w: 'give', d: 'to give', m: 'לְוַתֵּר' }, { w: 'up', d: 'up', m: 'לְוַתֵּר' }, { w: 'coffee', d: 'coffee', m: 'קָפֶה' }] },
    { en: 'What do you drink now?', he: 'מה אתה שותה עכשיו?', words: [{ w: 'drink', d: 'to drink', m: 'לִשְׁתּוֹת' }, { w: 'now', d: 'now', m: 'עַכְשָׁו' }] },
  ],
  struggled: [{ w: 'water', d: 'water', m: 'מַיִם' }],
};
function aiReply(system, messages) {
  const last = messages[messages.length - 1].content;
  if (/end-of-session summary/.test(system)) return { summary: 'Good talk today.', corrections: [{ said: 'I goed home', better: 'I went home' }], weakSpots: [{ note: 'past tense of go', kind: 'speaking' }], words: [{ w: 'house', d: 'house', m: 'בַּיִת' }] };
  if (/"phrase"/.test(system)) return { phrase: 'I want water' };
  if (/Pick the dictionary entry/.test(system)) return { choice: 1 };
  if (/check a language learner's spoken translation/.test(system)) return { correct: !/wrong/.test(last), better: 'אני רוצה ללכת הביתה', note: /wrong/.test(last) ? 'You said something else.' : '' };
  return tutorReply;
}

/* ---------- The stand-in Phonon ----------
   Same interface as phonon-tts (load, addVoice, synthWav, dispose). Each sentence becomes a 0.3 s
   beep, made after 120 ms; window.__tts records what was asked, and window.__audio what played. */
const FAKE_PHONON = `
const log = (window.__tts = window.__tts || { loads: [], voices: [], synth: [] });
function beep(seconds) {
  const rate = 8000, n = Math.round(rate * seconds), v = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o, x) => [...x].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(3000 * Math.sin(i / 3)), true);
  return new Blob([v], { type: 'audio/wav' });
}
export class PhononTTS {
  static async load(o) { log.loads.push(JSON.stringify(o)); return new PhononTTS(); }
  async addVoice(name) { log.voices.push(name); }
  async synthWav(text, o = {}) { log.synth.push({ text, voice: o.voice || '', at: performance.now() }); await new Promise(r => setTimeout(r, 120)); return beep(0.3); }
  dispose() {}
}`;

/* ---------- The checks ---------- */
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log((ok ? 'ok    ' : 'FAIL  ') + name + (extra ? '  (' + extra + ')' : '')); };

async function main() {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', acceptDownloads: true });
  const aiCalls = [];
  await context.route('https://cdn.jsdelivr.net/npm/phonon-tts@0.5.0/+esm', r => r.fulfill({ body: FAKE_PHONON, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' } }));
  await context.route('https://huggingface.co/**', r => r.abort());
  await context.route('https://api.groq.com/**', async r => {
    const url = r.request().url();
    if (url.endsWith('/models')) return r.fulfill({ json: { data: [{ id: 'llama-3.3-70b-versatile' }] } });
    const body = JSON.parse(r.request().postData());
    const system = body.messages[0].content, messages = body.messages.slice(1);
    aiCalls.push({ system, messages });
    return r.fulfill({ json: { choices: [{ message: { content: JSON.stringify(aiReply(system, messages)) } }] } });
  });
  /* The pretend microphone and voice, installed before the app's own code runs. */
  await context.addInitScript(() => {
    window.__say = '';
    class FakeRecognition {
      start() { this.timer = setTimeout(() => this.onresult && this.onresult({ results: [Object.assign([{ transcript: window.__say }], { isFinal: true })] }), 30); }
      stop() { clearTimeout(this.timer); setTimeout(() => this.onend && this.onend(), 10); }
      abort() { this.stop(); }
    }
    window.SpeechRecognition = window.webkitSpeechRecognition = FakeRecognition;
    window.__spoken = [];
    const synth = { speaking: false, pending: false, getVoices: () => [{ lang: 'he-IL', name: 'Hebrew' }, { lang: 'en-US', name: 'English' }], speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 5); }, cancel() {}, resume() {}, onvoiceschanged: null };
    Object.defineProperty(window, 'speechSynthesis', { value: synth });
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    /* What the audio player does: 'play'; 'end' when a sound reached its end; 'cut' when it
       stopped before the end; 'late end' for an "ended" signal that arrives after the next sound
       has already started (it must not stop that sound). At its end a sound sends "pause" and
       then "ended", and the browser may drop the "ended" once the next sound starts. */
    window.__audio = [];
    /* Listens to every audio player from the moment it is made, so it hears each signal before the
       app reacts to it (and perhaps starts the next sound). */
    const RealAudio = window.Audio;
    window.Audio = function (...args) {
      const el = new RealAudio(...args);
      const fin = ev => {
        if (el.__done) return;
        const atEnd = el.ended || (el.duration > 0 && el.currentTime >= el.duration - 0.05);
        if (atEnd) { el.__done = true; window.__audio.push('end'); }
        else if (ev.type === 'pause') { el.__done = true; window.__audio.push('cut'); }
        else window.__audio.push('late end');
      };
      el.addEventListener('pause', fin); el.addEventListener('ended', fin);
      return el;
    };
    window.Audio.prototype = RealAudio.prototype;
    const P = HTMLMediaElement.prototype, realPlay = P.play;
    P.play = function () { this.__done = false; window.__audio.push('play'); return realPlay.call(this); };
  });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (process.env.DEBUG) page.on('console', m => console.log('  [page] ' + m.text()));
  page.on('console', m => { if (m.type() === 'error' && !/Phonon failed|net::ERR_FAILED|Failed to load resource|Failed to fetch dynamically imported module/.test(m.text())) errors.push(m.text()); });
  const shot = async name => { if (SHOTS) { await mkdir(join(ROOT, 'tools/shots'), { recursive: true }); await page.screenshot({ path: join(ROOT, 'tools/shots', name + '.png') }); } };
  const speak = async (text, button) => { await page.evaluate(t => { window.__say = t; }, text); await page.click(button); await page.waitForTimeout(80); await page.click(button); };

  /* First visit: Settings opens because there is no key. */
  await page.goto(base);
  await page.waitForSelector('#set[open]', { timeout: 3000 }).catch(() => {});
  check('Settings opens on the first visit (no key yet)', await page.$eval('#set', d => d.open));
  await shot('01-settings');
  await page.fill('#rk', 'test-key');
  await page.click('#save');
  check('Saving Settings closes it', !(await page.$eval('#set', d => d.open)));
  check('The key is stored only in this browser', (await page.evaluate(() => localStorage.getItem('sp2_s'))).includes('test-key'));
  await shot('02-home');
  check('Home shows Chat, Guide and Drills', (await page.$$('[data-go]')).length === 3);

  /* Chat */
  await page.click('[data-go="chat"]');
  await page.evaluate(() => { window.__audio.length = 0; });
  await page.click('#go');
  await page.waitForSelector('.msg.tutor', { timeout: 5000 });
  check('Chat: the tutor starts the conversation', (await page.$$('.msg.tutor .sent')).length === 3);
  check('Chat: a split phrasal verb is joined ("give up")', await page.$$eval('.w', ws => ws.some(w => w.textContent === 'give up')));
  check('Chat: the Hebrew translation is shown', (await page.textContent('.line.he .t')).includes('שלום'));
  /* The tutor's sentences play in full, one after the other, and the later ones are made while
     the first plays (spec 3.2, Streaming by sentence). */
  await page.waitForFunction(() => window.__audio.filter(x => x === 'end').length >= 3, null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  const audio = await page.evaluate(() => ({ played: window.__audio.slice(), synth: window.__tts.synth.slice(-3) }));
  check('Chat: every sentence plays to the end, in order', audio.played.filter(x => x !== 'late end').join() === 'play,end,play,end,play,end', audio.played.join(', '));
  check('Chat: the later sentences are prepared while the first plays', audio.synth.map(x => x.text).join('|') === tutorReply.sentences.map(x => x.en).join('|') && audio.synth[2].at - audio.synth[0].at < 600);
  /* Stopping: the mic stops the tutor, and a sentence still being made is not played afterwards. */
  await page.evaluate(() => { window.__audio.length = 0; });
  await page.click('.sent .ic[data-a="target"]');
  await page.click('.sent .ic[data-a="target"]');
  await page.waitForTimeout(600);
  check('Chat: a quick double tap on play plays the sentence once, with no voice problem', (await page.evaluate(() => window.__audio.filter(x => x.startsWith('end')).length)) === 1 && !(await page.$eval('#toast', el => !el.hidden && /Voice problem/.test(el.textContent))));
  await shot('03-chat');
  await page.click('.w[data-w="coffee"]');
  await page.click('#wy');
  await page.waitForTimeout(200);
  check('Chat: tapping a word shows its translation and saves it', /Saved to My words|נשמר/.test(await page.textContent('#wd')), await page.textContent('#wd .mean'));
  await page.click('#wd .close');
  await speak('I goed home yesterday', '#mic');
  await page.waitForFunction(() => document.querySelectorAll('.msg.tutor').length === 2, null, { timeout: 5000 });
  check('Chat: what the learner said is sent to the tutor', aiCalls.some(c => c.messages.some(m => m.content === 'I goed home yesterday')));
  await speak('אני רוצה מים', '#say');
  await page.waitForSelector('.msg.say .big', { timeout: 5000 });
  check('Chat: How do I say it? shows the English phrase', (await page.textContent('.msg.say .big')) === 'I want water');
  await shot('04-howdoisay');
  await page.click('#end');
  await page.waitForSelector('#sum[open]', { timeout: 5000 });
  check('Chat: End session shows the summary', (await page.textContent('#sum')).includes('Good talk today'));
  await shot('05-summary');
  await page.click('#sum .close');
  check('Chat: after the summary the app is back home', await page.evaluate(() => document.body.dataset.view === 'home'));

  /* My words */
  await page.click('#wb');
  const listed = await page.$$eval('#wl .row b', bs => bs.map(b => b.textContent));
  check('My words lists the saved words', listed.includes('coffee') && listed.length >= 3, listed.join(', '));
  await shot('06-mywords');
  await page.click('#wl .close');

  /* Guide */
  await page.click('[data-go="guide"]');
  await page.click('#go');
  await page.waitForSelector('.msg.tutor', { timeout: 5000 });
  check('Guide: the tutor gets the Guide instructions', /Guide lesson/.test(aiCalls[aiCalls.length - 1].system));
  check('Guide: the weak spot from the last session reaches the tutor', /past tense of go/.test(aiCalls[aiCalls.length - 1].system));
  await shot('07-guide');
  await page.click('#back');
  await page.waitForSelector('#sum[open]', { timeout: 5000 }).catch(() => {});
  if (await page.$eval('#sum', d => d.open)) await page.click('#sum .close');

  /* Drills */
  await page.click('[data-go="drills"]');
  await page.click('#dgo');
  await page.waitForSelector('#drills .card .kind', { timeout: 5000 });
  let rounds = 0, intros = 0, words = 0, sentences = 0;
  while (rounds < 12) {
    const kind = await page.textContent('#drills .card .kind').catch(() => '');
    if (!kind) break;
    if (/New word|מילה חדשה/.test(kind)) { intros++; if (intros === 1) await shot('08-drill-intro'); await page.click('#dnext'); continue; }
    rounds++;
    const isSentence = /sentence|משפט/i.test(kind);
    if (isSentence) sentences++; else words++;
    if (rounds === 2) await shot('09-drill');
    /* Answer the first word right, by saying an accepted answer, and the second wrong. */
    const answer = await page.evaluate(() => window.__answer || '');
    await speak(isSentence ? (rounds % 2 ? 'I want to go home' : 'wrong') : answer || 'xyz', '#dmic');
    await page.waitForSelector('#dnext, #dyes', { timeout: 5000 });
    if (await page.$('#dyes')) await page.click('#dyes');
    await page.waitForSelector('#dnext', { timeout: 5000 });
    if (rounds === 1) await shot('10-drill-feedback');
    await page.click('#dnext');
    await page.waitForTimeout(50);
    if (await page.$('#dagain')) break;
  }
  check('Drills: a session runs to the end', !!(await page.$('#dagain')), `${rounds} drills, ${intros} intros, ${words} word, ${sentences} sentence`);
  await shot('11-drill-done');
  check('Drills: the drill count is saved', await page.evaluate(async () => {
    const db = await new Promise(ok => { const r = indexedDB.open('speaking-app'); r.onsuccess = () => ok(r.result); });
    return new Promise(ok => { const q = db.transaction('meta').objectStore('meta').get('drills'); q.onsuccess = () => ok((q.result && q.result.value) > 0); });
  }));

  /* More sessions, answering every word right, the way a learner who knows them would. Words
     become known, and sentence drills appear once every word of a sentence is known (spec 6.5). */
  const dicts = {};
  for (const l of ['en', 'he']) dicts[l] = JSON.parse(await readFile(join(ROOT, `packs/en-he/drills/dictionary-${l}.json`), 'utf8'));
  const answerFor = (text, lang) => {
    const other = lang === 'en' ? 'he' : 'en';
    for (const g of dicts[lang].groups) if (g.words.some(w => w.text === text)) return dicts[other].groups.find(x => x.id === g.id).words[0].accepted[0];
    return null;
  };
  const tally = { sessions: 0, words: 0, right: 0, sentences: 0, hintShown: false, hintFlagged: false, sentenceShot: false };
  while (tally.sessions < 20 && tally.sentences < 3) {
    tally.sessions++;
    await page.click('#dagain');
    await page.waitForSelector('#dagain', { state: 'detached', timeout: 5000 });
    for (let guard = 0; guard < 30; guard++) {
      await page.waitForSelector('#drills .card .kind, #dagain', { timeout: 5000 });
      if (await page.$('#dagain')) break;
      const kind = await page.textContent('#drills .card .kind');
      if (/New word/.test(kind)) { await page.click('#dnext'); continue; }
      const prompt = await page.$eval('#drills .line', l => ({ text: l.querySelector('.prompt').textContent, lang: l.lang }));
      if (/sentence/.test(kind)) {
        tally.sentences++;
        if (!tally.sentenceShot) { tally.sentenceShot = true; await shot('19-drill-sentence'); }
        /* Tap a word before answering, for its meaning (spec 6.6). */
        const tok = await page.$('#drills .tok');
        if (tok) {
          await tok.click();
          await page.waitForSelector('#wd[open]', { timeout: 3000 });
          tally.hintShown = tally.hintShown || !!(await page.textContent('#wd .mean')).trim();
          await page.click('#wd .close');
          tally.hintFlagged = tally.hintFlagged || !!(await page.$('#drills .tok.hinted'));
        }
        await speak('my translation of ' + prompt.text, '#dmic');
      } else {
        tally.words++;
        await speak(answerFor(prompt.text, prompt.lang) || 'xyz', '#dmic');
      }
      await page.waitForSelector('#dnext, #dyes', { timeout: 5000 });
      if (await page.$('#dyes')) await page.click('#dyes');
      await page.waitForSelector('#dnext', { timeout: 5000 });
      if (await page.$('#dres .verdict.ok')) tally.right++;
      await page.click('#dnext');
    }
  }
  check('Drills: every word said right is marked right', tally.right === tally.words + tally.sentences, `${tally.right} right of ${tally.words} words and ${tally.sentences} sentences in ${tally.sessions} sessions`);
  check('Drills: sentence drills appear once their words are known', tally.sentences > 0);
  check('Drills: tapping a word in a sentence shows its meaning and marks it', tally.hintShown && tally.hintFlagged);
  check('Drills: the AI checks sentence answers', aiCalls.some(c => /spoken translation/.test(c.system)));
  await page.click('#wb');
  check('My words: Drills fill the score dots', (await page.textContent('#wl')).includes('●'));
  await page.click('#wl .close');

  /* Leaving while the microphone is on: what was heard must not reach the next screen. */
  await page.click('#back');
  await page.click('[data-go="drills"]');
  await page.click('#dgo');
  await page.waitForSelector('#dmic');
  if (await page.$('#dnext') && /New word/.test(await page.textContent('#drills .kind'))) await page.click('#dnext');
  await page.evaluate(() => { window.__say = 'house'; });
  await page.click('#dmic');
  await page.click('#back');
  await page.waitForTimeout(150);
  check('Drills: leaving while recording answers nothing', await page.evaluate(() => document.body.dataset.view === 'home'));
  const before = aiCalls.length;
  await page.click('[data-go="chat"]');
  await page.click('#go');
  await page.waitForSelector('.msg.tutor', { timeout: 5000 });
  await page.evaluate(() => { window.__say = 'this should not be sent'; });
  await page.click('#mic');
  await page.click('#back');
  await page.waitForTimeout(300);
  if (await page.$eval('#sum', d => d.open)) await page.click('#sum .close');
  check('Chat: leaving while recording sends nothing to the tutor', !aiCalls.slice(before).some(c => c.messages.some(m => m.content === 'this should not be sent')));

  /* Settings: the voice list, and the interface in Hebrew (spec 9). */
  await page.click('#sb');
  check('Settings: 25 tutor voices plus the default', (await page.$$('#vo option')).length === 26);
  await page.selectOption('#vo', 'Maeve');
  await page.click('#vtry');
  await page.waitForFunction(() => window.__tts.synth.some(x => x.voice === 'Maeve'), null, { timeout: 5000 }).catch(() => {});
  check('Settings: Try this voice speaks with the chosen voice', await page.evaluate(() => window.__tts.voices.includes('Maeve') && window.__tts.synth.some(x => x.voice === 'Maeve' && /English tutor/.test(x.text))));
  await page.selectOption('#vo', 'Harper');
  await page.selectOption('#ui', 'he');
  await shot('12-settings-en');
  await page.click('#save');
  check('Hebrew interface: the page turns right-to-left', await page.evaluate(() => document.documentElement.dir === 'rtl' && document.documentElement.lang === 'he'));
  check('Hebrew interface: the home screen is in Hebrew', (await page.textContent('#home')).includes('שיחה חופשית'));
  check('Hebrew interface: the voice choice is saved', await page.evaluate(() => JSON.parse(localStorage.getItem('sp2_s')).voice === 'Harper'));
  await shot('13-home-he');
  await page.click('[data-go="chat"]');
  await page.click('#go');
  await page.waitForSelector('.msg.tutor', { timeout: 5000 });
  check('Hebrew interface: English sentences stay left-to-right', await page.$eval('.line.en', l => l.dir === 'ltr' && getComputedStyle(l).direction === 'ltr'));
  check('Hebrew interface: the buttons are in Hebrew', (await page.textContent('#say')) === 'איך אומרים?');
  await shot('14-chat-he');
  await page.click('#back');
  await page.waitForTimeout(300);
  if (await page.$eval('#sum', d => d.open)) await page.click('#sum .close');
  await page.click('[data-go="drills"]');
  await shot('15-drills-he');
  await page.click('#dgo');
  await page.waitForSelector('#drills .card .kind', { timeout: 5000 });
  await shot('16-drill-he');
  check('Hebrew interface: no raw text keys on screen', !/\b(?:drills|talk|set|app|home|words|word|common|sum)\.[a-z][A-Za-z]+\b/.test(await page.evaluate(() => document.body.innerText)));
  await page.click('#back');
  await page.click('#sb');
  await shot('17-settings-he');

  /* Backup: save a file, empty the database, and restore it (spec 8). */
  const wordsBefore = await page.evaluate(() => document.querySelector('#wb').textContent);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#bexp')]);
  const backupPath = join(ROOT, 'tools/shots-backup.json');
  await download.saveAs(backupPath);
  const backup = JSON.parse(await readFile(backupPath, 'utf8'));
  check('Backup: the file holds the words and no API key', backup.words.length > 0 && !JSON.stringify(backup).includes('test-key'), backup.words.length + ' words');
  await page.evaluate(() => new Promise(ok => { const r = indexedDB.open('speaking-app'); r.onsuccess = () => { const t = r.result.transaction('words', 'readwrite'); t.objectStore('words').clear(); t.oncomplete = ok; }; }));
  await page.reload();
  await page.waitForTimeout(500);
  const emptied = await page.evaluate(() => document.querySelector('#wb').textContent);
  await page.click('#sb');
  await page.setInputFiles('#bfile', backupPath);
  await page.waitForTimeout(500);
  check('Backup: restoring brings the words back', (await page.evaluate(() => document.querySelector('#wb').textContent)) === wordsBefore, `${wordsBefore} → ${emptied} → restored`);
  check('Backup: the restore message is shown', /שוחזרו|Restored/.test(await page.textContent('#toast')));
  await shot('18-restored');
  await page.setInputFiles('#bfile', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await page.waitForTimeout(300);
  check('Backup: a file that is not a backup is refused', /אינו גיבוי|not a backup/.test(await page.textContent('#toast')));
  await rm(backupPath);

  check('No errors in the page', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  server.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(failed ? `${failed} of ${results.length} checks failed.` : `All ${results.length} checks passed.`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
