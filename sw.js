/* The service worker (spec 3.2, PWA): a small script the browser runs beside the app. It keeps a
   copy of the app's own files, so the app can be installed to the home screen and opens even
   without a connection (Drills word practice then still works; the tutor needs the internet).

   It always asks the network first and keeps the copy for when the network fails, so a new
   version on the site is used as soon as it is there: there is nothing to clear or update by hand.
   On a connection that hangs (signal but no data), the saved copy is used after WAIT ms instead
   of a long blank screen; the network answer, if it still comes, updates the copy for next time.
   Requests to other sites (the AI, Phonon and its voices) are left alone; Phonon keeps its own
   copy of its model. */

const CACHE = 'speaking-app';
/* DEFAULT: how long to wait for the network before using the saved copy. */
const WAIT = 4000;
/* Saved when the app is installed, so it works offline from the start. Other files of the site
   are saved the first time they load. pwa.test.mjs checks that every file here exists. */
const FILES = [
  './', 'index.html', 'manifest.webmanifest',
  'app.js', 'shell.js', 'strings.js', 'talk.js', 'drill-screen.js', 'drills.js', 'drill-data.js',
  'services.js', 'tutor.js', 'words.js', 'dictionary.js', 'store.js', 'backup.js',
  'packs/en-he/pack.js', 'packs/en-he/drills/dictionary-en.json', 'packs/en-he/drills/dictionary-he.json',
  'packs/en-he/drills/sentences.json',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  /* One file failing (for example a slow connection) does not stop the others. no-cache: the
     server is asked whether each file changed, so an unchanged one is not downloaded again. */
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(FILES.map(f => c.add(new Request(f, { cache: 'no-cache' }))))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const net = fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(req, copy))); }
    return res;
  });
  e.waitUntil(net.catch(() => {}));
  const saved = async () => (await caches.match(req, { ignoreSearch: true })) ||
    (req.mode === 'navigate' && await caches.match('index.html')) || null;
  e.respondWith((async () => {
    let timer;
    const slow = new Promise(r => { timer = setTimeout(r, WAIT); });
    try {
      /* The network answer, unless it takes longer than WAIT and a saved copy exists. */
      const first = await Promise.race([net, slow.then(() => 'slow')]);
      if (first !== 'slow') return first;
      return (await saved()) || await net;
    } catch (err) {
      return (await saved()) || Response.error();
    } finally { clearTimeout(timer); }
  })());
});
