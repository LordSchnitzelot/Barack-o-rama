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
   - Phonon is not downloaded (its CDN is blocked), so the app falls back to the browser voice. */
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

/* ---------- The checks ---------- */
const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log((ok ? 'ok    ' : 'FAIL  ') + name + (extra ? '  (' + extra + ')' : '')); };

async function main() {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block', acceptDownloads: true });
  const aiCalls = [];
  await context.route('https://cdn.jsdelivr.net/**', r => r.abort());
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
  });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
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
  await page.click('#go');
  await page.waitForSelector('.msg.tutor', { timeout: 5000 });
  check('Chat: the tutor starts the conversation', (await page.$$('.msg.tutor .sent')).length === 2);
  check('Chat: a split phrasal verb is joined ("give up")', await page.$$eval('.w', ws => ws.some(w => w.textContent === 'give up')));
  check('Chat: the Hebrew translation is shown', (await page.textContent('.line.he .t')).includes('שלום'));
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
