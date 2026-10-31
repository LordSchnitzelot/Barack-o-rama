/* Saves the learner profile on the device, in IndexedDB (spec 8, Storage): the browser's built-in
   database, which keeps more data than localStorage and is the one the spec chose.
   Three stores: My words, the weak-spot notes, and a few single values ("meta", such as how many
   drills have been answered). Every record has an id and a last-modified time,
   so cloud sync can be added later.
   If the browser blocks IndexedDB (some private windows), data is kept only until the page closes. */

const DB = 'speaking-app', VERSION = 3, WORDS = 'words', NOTES = 'notes', META = 'meta';
let db = null;

export async function open() {
  if (db) return db;
  db = new Promise((ok, fail) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const name of [WORDS, NOTES, META]) if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, { keyPath: 'id' });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  }).catch(e => { console.warn('IndexedDB not available', e); return null; });
  return db;
}

/* fn gets the object store, or a Map standing in for it when IndexedDB is blocked. */
const memory = { [WORDS]: new Map(), [NOTES]: new Map(), [META]: new Map() };
function run(name, mode, fn) {
  return open().then(d => {
    if (!d) return fn(null, memory[name]);
    return new Promise((ok, fail) => {
      const t = d.transaction(name, mode), req = fn(t.objectStore(name));
      t.oncomplete = () => ok(req && req.result);
      t.onerror = () => fail(t.error);
    });
  });
}
const getAll = name => run(name, 'readonly', (s, m) => s ? s.getAll() : [...m.values()]);
const putAll = (name, items) => run(name, 'readwrite', (s, m) => { for (const x of items) s ? s.put(x) : m.set(x.id, x); return null; });
const deleteAll = (name, ids) => run(name, 'readwrite', (s, m) => { for (const id of ids) s ? s.delete(id) : m.delete(id); return null; });

export const available = () => open().then(d => !!d);

/* My words (words.js describes a record). */
export const allWords = () => getAll(WORDS);
export const putWord = w => putAll(WORDS, [w]);
export const putWords = ws => putAll(WORDS, ws);
export const deleteWords = ids => deleteAll(WORDS, ids);

/* Weak-spot notes (spec 8): { id, note, kind: 'understanding' | 'speaking', created, modified }. */
export const allNotes = () => getAll(NOTES);
export const putNote = n => putAll(NOTES, [n]);
/* Keeps only the newest max notes. */
export async function trimNotes(max) {
  const old = (await allNotes()).sort((a, b) => b.created - a.created).slice(max).map(n => n.id);
  if (old.length) await deleteAll(NOTES, old);
}

/* Single values: getMeta('drills', 0) -> the stored value, or the default. */
export async function getMeta(id, fallback) {
  const r = (await getAll(META)).find(x => x.id === id);
  return r ? r.value : fallback;
}
export const setMeta = (id, value) => putAll(META, [{ id, value, modified: Date.now() }]);
