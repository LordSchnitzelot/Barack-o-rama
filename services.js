/* Services (spec 3.1): the app talks to generic services, and the provider behind each one is a
   setting, so any of them can be replaced later without touching the rest of the app.

   - AI model:  ai.complete(system, messages) -> the model's text reply
   - Speak:     speech.speak(text, lang, { slow, voice }), speech.prepare(texts, lang) and
                speech.stop(), with lang a pack language (pack.target or pack.native); the pack
                says which voice each language uses
   - Listen:    listen(lang, { onText, onEnd, onError }) -> { stop(), cancel() }

   To add a provider (for example a backend that holds the API key, spec 3.2), add an entry to
   AI_PROVIDERS or VOICES with the same functions; nothing else changes. */
import { t, langName } from './strings.js';

/* ---------- AI model ---------- */

const TIMEOUT = 40000;

async function post(url, headers, body, who) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: ctl.signal, method: body ? 'POST' : 'GET', headers: Object.assign({ 'content-type': 'application/json' }, headers), body: body && JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || t('ai.error', { who, status: r.status }));
    return j;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error(t('ai.timeout'));
    if (e instanceof TypeError && navigator.onLine === false) throw new Error(t('ai.offline'));
    throw e;
  } finally { clearTimeout(tm); }
}

/* Each provider: name, hasKey(settings), complete(settings, system, messages) -> text, and
   label(settings) for the status line. messages are [{ role: 'user' | 'assistant', content }]. */
export const AI_PROVIDERS = {
  groq: {
    name: 'Groq',
    hasKey: S => !!S.rk,
    picked: null,
    async model(S) {
      if (S.gm) return S.gm;
      if (this.picked && this.picked.key === S.rk) return this.picked.id;
      const j = await post('https://api.groq.com/openai/v1/models', { Authorization: 'Bearer ' + S.rk }, null, 'Groq');
      const ids = (j.data || []).map(m => m.id).filter(id => !/whisper|tts|guard|orpheus|embed|compound/i.test(id));
      const pref = [/gpt-oss-120b/, /qwen.*(3\.6|27b|32b)/, /gpt-oss-20b/, /llama-3\.3-70b/, /llama-4/, /llama/, /qwen/];
      let id = null;
      for (const x of pref) { id = ids.find(i => x.test(i)); if (id) break; }
      id = id || ids[0];
      if (!id) throw new Error(t('ai.noModels'));
      this.picked = { key: S.rk, id };
      return id;
    },
    async complete(S, system, messages) {
      const model = await this.model(S);
      const body = { model, messages: [{ role: 'system', content: system }].concat(messages) };
      if (/gpt-oss/.test(model)) body.reasoning_effort = 'low';
      const j = await post('https://api.groq.com/openai/v1/chat/completions', { Authorization: 'Bearer ' + S.rk }, body, 'Groq');
      return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    },
    label(S) { return 'Groq' + (S.gm || (this.picked && this.picked.id) ? ' (' + (S.gm || this.picked.id) + ')' : ''); },
  },
  gemini: {
    name: 'Gemini',
    hasKey: S => !!S.gk,
    async complete(S, system, messages) {
      const j = await post('https://generativelanguage.googleapis.com/v1beta/models/' + S.model + ':generateContent', { 'x-goog-api-key': S.gk }, {
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
        generationConfig: { responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'low' } },
      }, 'Gemini');
      return ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('');
    },
    label(S) { return 'Gemini (' + S.model + ')'; },
  },
};

/* settings() returns the current settings; S.pv names the provider. */
export function createAI(settings) {
  const P = () => AI_PROVIDERS[settings().pv] || AI_PROVIDERS.groq;
  return {
    name: () => P().name,
    hasKey: () => P().hasKey(settings()),
    label: () => P().label(settings()),
    complete: (system, messages) => P().complete(settings(), system, messages),
  };
}

/* ---------- Speak ---------- */

/* Speed dial value -> Phonon's duration_delta (positive is slower, 0 is normal). It is fixed when
   the model loads, so changing speed reloads Phonon (from the browser cache, no new download).
   Measured: 0.2 speaks at about 0.89x and 0.3 at about 0.875x; larger values barely slow it further,
   so the browser's playback speed makes up whatever is left (only "Slow" needs it). */
const DD = { '1': 0, '0.9': 0.2, '0.75': 0.3 };
const NAT = { 0: 1, 0.2: 0.89, 0.3: 0.875 };
const SPN = { '1': 'speed.normal', '0.9': 'speed.easy', '0.75': 'speed.slow' };
/* DEFAULT: how many generated sentences are kept for replay; the oldest are dropped. */
const KEEP_AUDIO = 80;

/* A twentieth of a second of silence, as a WAV file, to unlock the audio player (see below). */
function silence() {
  const n = 1200, v = new DataView(new ArrayBuffer(44 + n * 2));
  [...'RIFF'].forEach((c, i) => v.setUint8(i, c.charCodeAt(0))); v.setUint32(4, 36 + n * 2, true);
  [...'WAVEfmt '].forEach((c, i) => v.setUint8(8 + i, c.charCodeAt(0)));
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 24000, true);
  v.setUint32(28, 48000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  [...'data'].forEach((c, i) => v.setUint8(36 + i, c.charCodeAt(0))); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([v], { type: 'audio/wav' }));
}

/* opts = { settings: () => S (uses S.speed, S.rateBy and S.voice), status(text), toast(text),
   target: the pack's target language, voices: the pack's list of Phonon voices } */
export function createSpeech(opts) {
  const S = () => opts.settings(), status = opts.status, toast = opts.toast;
  const targetName = () => langName(opts.target.code);
  const catalog = opts.voices || { base: '', list: [] };
  const knownVoice = name => !!name && catalog.list.some(v => v.name === name);
  const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /* -- Browser voice: Hebrew, and the fallback for any language -- */
  let voices = [], lastU = null;
  const warned = new Set();
  const loadVoices = () => { voices = speechSynthesis.getVoices(); };
  if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  const voiceFor = lang => { const b = lang.slice(0, 2), L = v => v.lang.replace('_', '-').toLowerCase(); return voices.find(v => L(v) === lang.toLowerCase()) || voices.find(v => L(v).startsWith(b) || (b === 'he' && L(v).startsWith('iw'))) || null; };
  function browserSpeak(text, lang, rate) {
    if (!window.speechSynthesis) { toast(t('voice.cantSpeak')); return Promise.resolve(); }
    const v = voiceFor(lang.speech);
    if (!v && voices.length && !warned.has(lang.code)) { warned.add(lang.code); toast(t('voice.missing', { lang: langName(lang.code) })); }
    return new Promise(r => {
      /* Kept in a variable so Android Chrome does not drop it before it finishes. */
      const u = lastU = new SpeechSynthesisUtterance(text); u.lang = lang.speech; if (v) u.voice = v; u.rate = rate;
      const tm = setTimeout(r, 3000 + text.length * 150);
      u.onend = u.onerror = () => { clearTimeout(tm); r(); };
      /* Spoken right away, inside the tap, because iPhone only allows speech that starts from a tap. */
      speechSynthesis.resume(); speechSynthesis.speak(u);
    });
  }

  /* -- The audio player for Phonon's sound --
     One player is used for every sentence. iPhone lets a page play sound only from a tap, but a
     player that has played once from a tap may play again later, for example when the tutor's
     reply arrives. So the first tap anywhere plays a moment of silence on it. */
  const player = new Audio();
  player.preservesPitch = true;
  let waiting = null; // ends the wait for the sound now playing
  const endWait = () => { const w = waiting; waiting = null; if (w) w(); };
  /* An "ended" or "pause" from an earlier sound can arrive after the next one has started, so only
     one that matches the player's state counts. */
  player.addEventListener('ended', () => { if (player.ended) endWait(); });
  player.addEventListener('pause', () => { if (player.paused) endWait(); });
  async function playUrl(url, rate) {
    endWait();
    player.src = url;
    player.defaultPlaybackRate = player.playbackRate = rate;
    let done;
    const ended = new Promise(r => { done = r; });
    waiting = done;
    try { await player.play(); }
    catch (e) {
      if (waiting === done) waiting = null; // a newer sound may already be waiting; leave it alone
      if (e.name === 'AbortError') return; // stopped, or replaced by another sound, before it began
      throw e;
    }
    await ended;
  }
  let unlocked = false;
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    ['click', 'touchend', 'keydown'].forEach(ev => document.removeEventListener(ev, unlock, true));
    if (!player.src) { player.src = silence(); player.play().catch(() => {}); }
    /* The same for the browser voice on iPhone. */
    if (iOS && window.speechSynthesis) speechSynthesis.speak(new SpeechSynthesisUtterance(' '));
  }
  ['click', 'touchend', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, true));

  /* -- Phonon: the on-device English voice -- */
  let PH = null, phLoad = null, phKey = null, q = Promise.resolve();
  /* Counts stop() calls: a sentence still being generated when the sound is stopped (for example
     when the learner starts talking) is not played once it is ready. */
  let stops = 0;
  const cache = new Map();
  const byBrowser = P => S().rateBy === 'browser' || P.fallback;
  const rateOf = P => { if (byBrowser(P)) return +S().speed; const r = +S().speed / (NAT[P.delta] || 1); return Math.abs(r - 1) < 0.03 ? 1 : r; };
  const speedNote = P => t('voice.ready', { speed: t(SPN[S().speed] || 'speed.normal') }) + (rateOf(P) !== 1 ? t(byBrowser(P) ? 'voice.browserSlow' : 'voice.mixedSlow') : '');
  function phMod() {
    if (!PH) PH = (async () => {
      /* Browsers refuse workers loaded from another site, so wrap the CDN worker in a same-origin blob that imports it. */
      const RW = window.Worker;
      window.Worker = function (u, o) {
        const x = String(u);
        if (/^https?:/.test(x) && new URL(x).origin !== location.origin) u = URL.createObjectURL(new Blob(['import ' + JSON.stringify(x) + ';'], { type: 'text/javascript' }));
        return new RW(u, o);
      };
      window.Worker.prototype = RW.prototype;
      return await import('https://cdn.jsdelivr.net/npm/phonon-tts@0.5.0/+esm');
    })();
    return PH;
  }
  /* Resolves to {tts, delta, fallback, voices} for the current speed, or null if Phonon cannot run
     here. voices: name -> promise of the name once the voice is added ('' if it failed). */
  function phonon() {
    const dd = S().rateBy === 'browser' ? 0 : (DD[S().speed] || 0), key = String(dd);
    if (phLoad && phKey === key) return phLoad;
    const old = phLoad; phKey = key;
    phLoad = (async () => {
      status(t(old ? 'voice.changing' : 'voice.loading', { target: targetName() }));
      let P = null;
      try {
        const m = await phMod();
        try { P = { tts: await m.PhononTTS.load(dd ? { lang: 'en', conditions: { duration_delta: dd } } : { lang: 'en' }), delta: dd, fallback: false }; }
        catch (e) {
          if (!dd) throw e;
          console.warn('Phonon speed setting failed, slowing in the browser instead', e);
          P = { tts: await m.PhononTTS.load({ lang: 'en' }), delta: 0, fallback: true };
        }
        P.voices = new Map();
      } catch (e) { console.error('Phonon failed', e); status(t('voice.failed', { target: targetName(), e: (e && e.message) || e })); }
      /* Free the previous model once anything it was still generating has finished. */
      if (old) old.then(o => { if (o && o !== P) q.then(() => o.tts.dispose()); });
      if (P) status(speedNote(P));
      return P;
    })();
    return phLoad;
  }
  /* Adds a voice from Phonon's catalog the first time it is used (spec 9, tutor voice). Resolves
     to the name to pass to Phonon, or '' for the model's own voice. */
  function useVoice(P, name) {
    if (!knownVoice(name)) return Promise.resolve('');
    if (!P.voices.has(name)) {
      const v = catalog.list.find(x => x.name === name);
      status(t('voice.loadingVoice', { name }));
      P.voices.set(name, P.tts.addVoice(name, catalog.base + v.file).then(() => { status(speedNote(P)); return name; }, e => {
        P.voices.delete(name);
        toast(t('voice.voiceFailed', { name, e: (e && e.message) || e }));
        return '';
      }));
    }
    return P.voices.get(name);
  }
  /* Generates a sentence once and keeps it, so replaying is instant. Requests run one at a time.
     now: the sentence is about to be played. A sentence only prepared ahead is skipped when its
     turn comes if the sound was stopped since (the learner moved on), so it does not hold up what
     is needed next. */
  function synth(P, text, voice, now) {
    const k = P.delta + '|' + voice + '|' + text;
    let e = cache.get(k);
    if (!e) {
      e = { stops, now: false };
      e.url = q.then(() => {
        if (!e.now && e.stops !== stops) throw new Error('skipped');
        return P.tts.synthWav(text, voice ? { voice } : {});
      }).then(b => URL.createObjectURL(b));
      q = e.url.catch(() => {});
      cache.set(k, e);
      e.url.catch(() => { if (cache.get(k) === e) cache.delete(k); });
      if (cache.size > KEEP_AUDIO) {
        const [oldest, o] = cache.entries().next().value;
        cache.delete(oldest); o.url.then(u => URL.revokeObjectURL(u), () => {});
      }
    }
    if (now) e.now = true;
    return e.url;
  }
  /* DEFAULT: the "slower" button plays a sentence at this share of the current speed. */
  const SLOWER = 0.75;
  async function phononSpeak(text, lang, slow, voiceName) {
    const my = stops;
    const P = await phonon();
    if (my !== stops) return;
    if (!P) return browserSpeak(text, lang, +S().speed * (slow ? SLOWER : 1));
    const voice = await useVoice(P, voiceName ?? S().voice);
    status(t('voice.generating'));
    const url = await Promise.race([synth(P, text, voice, true), new Promise((_, rj) => setTimeout(() => rj(new Error(t('voice.tooSlow'))), 25000))]);
    status(speedNote(P));
    if (my !== stops) return;
    await playUrl(url, rateOf(P) * (slow ? SLOWER : 1));
  }

  /* The voices a pack can name. The speed dial only applies to the target language. */
  const VOICES = {
    phonon: {
      speak: phononSpeak,
      load: () => phonon().then(P => P && useVoice(P, S().voice)),
      /* Starts generating every sentence of a reply at once, so each one is ready by the time
         the one before it finishes playing (spec 3.2, Streaming by sentence). */
      prepare: async texts => {
        const P = await phonon();
        if (!P) return;
        const voice = await useVoice(P, S().voice);
        texts.forEach(x => synth(P, x, voice, false).catch(() => {}));
      },
    },
    browser: { speak: (text, lang, slow) => browserSpeak(text, lang, (lang === opts.target ? +S().speed : 1) * (slow ? SLOWER : 1)), load: () => {}, prepare: () => {} },
  };
  const voiceOf = lang => VOICES[lang.voice] || VOICES.browser;

  return {
    /* Loads (or reloads, after a speed or voice change) the voices the pack uses. */
    load() { voiceOf(opts.target).load(); },
    prepare(texts, lang) { return Promise.resolve(voiceOf(lang).prepare(texts)).catch(() => {}); },
    /* voice: a Phonon voice name to use instead of the one in the settings (to try a voice out). */
    async speak(text, lang, { slow = false, voice } = {}) {
      const my = stops;
      try { await voiceOf(lang).speak(text, lang, slow, voice); }
      catch (e) {
        console.error(e);
        if (lang.voice === 'browser' || my !== stops) return; // stopped meanwhile: say nothing
        toast(t('voice.problem', { e: e.message || e }));
        await browserSpeak(text, lang, +S().speed * (slow ? SLOWER : 1));
      }
    },
    stop() {
      stops++;
      if (window.speechSynthesis && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel();
      player.pause(); endWait();
    },
  };
}

/* ---------- Listen: the browser's speech recognition ---------- */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = !!SR;

/* Streams what the user says in lang (a pack language) until stop() is called.
   onText(text) gets the full transcript so far; onEnd(text) gets the final one.
   cancel() stops listening and throws away what was heard: onEnd is not called. */
export function listen(lang, { onText, onEnd, onError }) {
  const r = new SR();
  let heard = '', cancelled = false;
  r.lang = lang.speech; r.interimResults = true;
  /* Android's recognizer misbehaves in continuous mode, so it gets one phrase at a time. */
  r.continuous = !/Android/i.test(navigator.userAgent);
  r.onresult = e => {
    let fin = '', part = '';
    for (let i = 0; i < e.results.length; i++) { const x = e.results[i]; if (x.isFinal) fin += x[0].transcript + ' '; else part = x[0].transcript; }
    heard = (fin + part).trim();
    if (!cancelled) onText(heard);
  };
  r.onerror = e => {
    if (cancelled) return;
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') onError(t('mic.blocked'));
    else if (e.error === 'audio-capture') onError(t('mic.none'));
    else if (e.error === 'network') onError(t('mic.network'));
  };
  r.onend = () => { if (!cancelled) onEnd(heard); };
  r.start();
  return {
    stop: () => r.stop(),
    cancel: () => { cancelled = true; try { r.abort(); } catch (e) { r.stop(); } },
  };
}
