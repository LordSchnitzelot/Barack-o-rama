/* Services (spec 3.1): the app talks to generic services, and the provider behind each one is a
   setting, so any of them can be replaced later without touching the rest of the app.

   - AI model:  ai.complete(system, messages) -> the model's text reply
   - Speak:     speech.speak(text, lang, { slow }) and speech.stop(), with lang a pack language
                (pack.target or pack.native); the pack says which voice each language uses
   - Listen:    listen(lang, { onText, onEnd, onError }) -> { stop() }

   To add a provider (for example a backend that holds the API key, spec 3.2), add an entry to
   AI_PROVIDERS or VOICES with the same functions; nothing else changes. */

/* ---------- AI model ---------- */

const TIMEOUT = 40000;

async function post(url, headers, body, who) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: ctl.signal, method: body ? 'POST' : 'GET', headers: Object.assign({ 'content-type': 'application/json' }, headers), body: body && JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || who + ' error ' + r.status);
    return j;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('The AI took longer than 40 seconds. Free servers can be overloaded, so try again.');
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
      if (!id) throw new Error('No chat models found on your Groq account');
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
const SPN = { '1': 'Normal', '0.9': 'Easy', '0.75': 'Slow' };

/* opts = { settings: () => S (uses S.speed and S.rateBy), status(text), toast(text) } */
export function createSpeech(opts) {
  const S = () => opts.settings(), status = opts.status, toast = opts.toast;

  /* -- Browser voice: Hebrew, and the fallback for any language -- */
  let voices = [], lastU = null;
  const loadVoices = () => { voices = speechSynthesis.getVoices(); };
  if (window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  const voiceFor = lang => { const b = lang.slice(0, 2), L = v => v.lang.replace('_', '-').toLowerCase(); return voices.find(v => L(v) === lang.toLowerCase()) || voices.find(v => L(v).startsWith(b) || (b === 'he' && L(v).startsWith('iw'))) || null; };
  function browserSpeak(text, lang, rate) {
    if (!window.speechSynthesis) { toast('This browser cannot speak text aloud.'); return Promise.resolve(); }
    const v = voiceFor(lang.speech);
    if (!v && lang.code === 'he' && voices.length) toast('No Hebrew voice found on this device. Add one in your phone settings (Android: Text-to-speech; iPhone: Accessibility, Spoken Content, Voices), then reload.');
    return new Promise(r => {
      /* Kept in a variable so Android Chrome does not drop it before it finishes. */
      const u = lastU = new SpeechSynthesisUtterance(text); u.lang = lang.speech; if (v) u.voice = v; u.rate = rate;
      const tm = setTimeout(r, 3000 + text.length * 150);
      u.onend = u.onerror = () => { clearTimeout(tm); r(); };
      /* Spoken right away, inside the tap, because iPhone only allows speech that starts from a tap. */
      speechSynthesis.resume(); speechSynthesis.speak(u);
    });
  }

  /* -- Phonon: the on-device English voice -- */
  let PH = null, phLoad = null, phKey = null, cur = null, q = Promise.resolve();
  const cache = new Map();
  const byBrowser = P => S().rateBy === 'browser' || P.fallback;
  const rateOf = P => { if (byBrowser(P)) return +S().speed; const r = +S().speed / (NAT[P.delta] || 1); return Math.abs(r - 1) < 0.03 ? 1 : r; };
  const speedNote = P => 'English voice: Phonon ready · speed ' + SPN[S().speed] + (rateOf(P) !== 1 ? (byBrowser(P) ? ' (browser slowdown)' : ' (Phonon + a little browser slowdown)') : '');
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
  /* Resolves to {tts, delta, fallback} for the current speed, or null if Phonon cannot run here. */
  function phonon() {
    const dd = S().rateBy === 'browser' ? 0 : (DD[S().speed] || 0), key = String(dd);
    if (phLoad && phKey === key) return phLoad;
    const old = phLoad; phKey = key;
    phLoad = (async () => {
      status(old ? 'English voice: changing speed…' : 'English voice: loading…');
      let P = null;
      try {
        const m = await phMod();
        try { P = { tts: await m.PhononTTS.load(dd ? { lang: 'en', conditions: { duration_delta: dd } } : { lang: 'en' }), delta: dd, fallback: false }; }
        catch (e) {
          if (!dd) throw e;
          console.warn('Phonon speed setting failed, slowing in the browser instead', e);
          P = { tts: await m.PhononTTS.load({ lang: 'en' }), delta: 0, fallback: true };
        }
      } catch (e) { console.error('Phonon failed', e); status('English voice: Phonon failed (' + (e && e.message || e) + '). Using the browser voice.'); }
      /* Free the previous model once anything it was still generating has finished. */
      if (old) old.then(o => { if (o && o !== P) q.then(() => o.tts.dispose()); });
      if (P) status(speedNote(P));
      return P;
    })();
    return phLoad;
  }
  function synth(P, t) {
    const k = P.delta + '|' + t;
    if (!cache.has(k)) {
      const p = q.then(() => P.tts.synthWav(t)).then(b => URL.createObjectURL(b));
      q = p.catch(() => {}); cache.set(k, p); p.catch(() => cache.delete(k));
    }
    return cache.get(k);
  }
  /* DEFAULT: the "slower" button plays a sentence at this share of the current speed. */
  const SLOWER = 0.75;
  async function phononSpeak(text, lang, slow) {
    const P = await phonon();
    if (!P) return browserSpeak(text, lang, +S().speed * (slow ? SLOWER : 1));
    status('Generating voice…');
    const u = await Promise.race([synth(P, text), new Promise((_, rj) => setTimeout(() => rj(new Error('Phonon took longer than 25 seconds')), 25000))]);
    status(speedNote(P));
    if (cur) cur.pause();
    const a = cur = new Audio(u); a.preservesPitch = true; a.playbackRate = rateOf(P) * (slow ? SLOWER : 1);
    await a.play();
    await new Promise(r => { a.onended = r; a.onpause = r; });
  }

  /* The voices a pack can name. The speed dial only applies to the target language. */
  const VOICES = {
    phonon: { speak: phononSpeak, load: phonon },
    browser: { speak: (text, lang, slow) => browserSpeak(text, lang, (lang === opts.target ? +S().speed : 1) * (slow ? SLOWER : 1)), load: () => {} },
  };
  const voiceOf = lang => VOICES[lang.voice] || VOICES.browser;

  return {
    /* Loads (or reloads, after a speed change) the voices the pack uses. */
    load() { voiceOf(opts.target).load(); },
    async speak(text, lang, { slow = false } = {}) {
      try { await voiceOf(lang).speak(text, lang, slow); }
      catch (e) {
        console.error(e);
        if (lang.voice === 'browser') return;
        toast('Voice problem (' + (e.message || e) + '). Using the browser voice.');
        await browserSpeak(text, lang, +S().speed * (slow ? SLOWER : 1));
      }
    },
    stop() {
      if (window.speechSynthesis && (speechSynthesis.speaking || speechSynthesis.pending)) speechSynthesis.cancel();
      if (cur) cur.pause();
    },
  };
}

/* ---------- Listen: the browser's speech recognition ---------- */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = !!SR;

/* Streams what the user says in lang (a pack language) until stop() is called.
   onText(text) gets the full transcript so far; onEnd(text) gets the final one. */
export function listen(lang, { onText, onEnd, onError }) {
  const r = new SR();
  let heard = '';
  r.lang = lang.speech; r.interimResults = true;
  /* Android's recognizer misbehaves in continuous mode, so it gets one phrase at a time. */
  r.continuous = !/Android/i.test(navigator.userAgent);
  r.onresult = e => {
    let fin = '', part = '';
    for (let i = 0; i < e.results.length; i++) { const x = e.results[i]; if (x.isFinal) fin += x[0].transcript + ' '; else part = x[0].transcript; }
    heard = (fin + part).trim();
    onText(heard);
  };
  r.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') onError('Microphone blocked. Allow mic access, or open the page over https.');
  };
  r.onend = () => onEnd(heard);
  r.start();
  return { stop: () => r.stop() };
}
