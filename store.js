/* Saves the learner profile on the device, in IndexedDB (spec 8, Storage): the browser's built-in
   database, which keeps more data than localStorage and is the one the spec chose.
   Every record has an id and a last-modified time, so cloud sync can be added later.
   If the browser blocks IndexedDB (some private windows), words are kept only until the page closes. */

const DB = 'speaking-app', VERSION = 1, WORDS = 'words';
let db = null;

export async function open() {
  if (db) return db;
  db = new Promise((ok, fail) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => r.result.createObjectStore(WORDS, { keyPath: 'id' });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  }).catch(e => { console.warn('IndexedDB not available', e); return null; });
  return db;
}

const memory = new Map();
function run(mode, fn) {
  return open().then(d => d ? new Promise((ok, fail) => {
    const t = d.transaction(WORDS, mode), req = fn(t.objectStore(WORDS));
    t.oncomplete = () => ok(req && req.result);
    t.onerror = () => fail(t.error);
  }) : fn(null));
}

export const available = () => open().then(d => !!d);
export const allWords = () => run('readonly', s => s ? s.getAll() : [...memory.values()]);
export const putWord = w => run('readwrite', s => s ? s.put(w) : (memory.set(w.id, w), null));
export const putWords = ws => run('readwrite', s => { for (const w of ws) s ? s.put(w) : memory.set(w.id, w); return null; });
export const deleteWords = ids => run('readwrite', s => { for (const id of ids) s ? s.delete(id) : memory.delete(id); return null; });
