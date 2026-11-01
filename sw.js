/* The service worker (spec 3.2, PWA): a small script the browser runs beside the app. It keeps a
   copy of the app's own files, so the app can be installed to the home screen and opens even
   without a connection (Drills word practice then still works; the tutor needs the internet).

   It always asks the network first and keeps the copy only for when the network fails, so a new
   version on the site is used as soon as it is there: there is nothing to clear or update by hand.
   Requests to other sites (the AI, Phonon and its voices) are left alone; Phonon keeps its own
   copy of its model. */

const CACHE = 'speaking-app';
/* Saved when the app is installed, so it works offline from the start. Other files of the site
   are saved the first time they load. pwa.test.mjs checks that every file here exists. */
const FILES = [
  './', 'index.html', 'manifest.webmanifest',
  'app.js', 'shell.js', 'strings.js', 'talk.js', 'drill-screen.js', 'drills.js', 'drill-data.js',
  'services.js', 'tutor.js', 'words.js', 'dictionary.js', 'store.js', 'backup.js',
  'packs/en-he/pack.js', 'packs/en-he/drills/dictionary-en.json', 'packs/en-he/drills/dictionary-he.json',
  'packs/en-he/drills/sentences.json',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  /* One file failing (for example a slow connection) does not stop the others. */
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(FILES.map(f => c.add(new Request(f, { cache: 'reload' }))))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(req, copy))); }
      return res;
    } catch (err) {
      const saved = await caches.match(req, { ignoreSearch: true });
      if (saved) return saved;
      if (req.mode === 'navigate') return (await caches.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});
