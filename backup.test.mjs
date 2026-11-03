/* Tests for backup.js. Run: node --test */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as B from './backup.js';

const word = (id, modified, extra = {}) => Object.assign({ id, entry: id, text: id, modified, sources: [] }, extra);

test('a backup holds the progress and the settings, but never the API keys', () => {
  const b = B.makeBackup({ words: [word('en1', 5)], notes: [{ id: 'n1', note: 'past tense', modified: 5 }], meta: [{ id: 'drills', value: 40, modified: 5 }],
    settings: { rk: 'secret-groq', gk: 'secret-gemini', speed: '0.9', ui: 'he' } }, Date.UTC(2026, 9, 31));
  assert.equal(b.format, B.FORMAT);
  assert.equal(b.version, B.VERSION);
  assert.equal(b.exported, '2026-10-31T00:00:00.000Z');
  assert.deepEqual(b.settings, { speed: '0.9', ui: 'he' });
  assert.ok(!JSON.stringify(b).includes('secret'));
  assert.equal(b.words.length, 1);
});

test('the file name carries the date', () => {
  assert.equal(B.fileName(Date.UTC(2026, 0, 2, 15)), 'speaking-backup-2026-01-02.json');
});

test('a backup survives being saved and read back', () => {
  const b = B.makeBackup({ words: [word('en1', 5)], notes: [{ id: 'n1', note: 'x', modified: 2 }], meta: [{ id: 'drills', value: 3, modified: 1 }], settings: { en: 'hide' } });
  const r = B.readBackup(JSON.stringify(b));
  assert.deepEqual(r.words, b.words);
  assert.deepEqual(r.notes, b.notes);
  assert.deepEqual(r.meta, b.meta);
  assert.deepEqual(r.settings, { en: 'hide' });
});

test('files that are not backups are refused with a clear reason', () => {
  const code = text => { try { B.readBackup(text); return 'read'; } catch (e) { return e.code; } };
  assert.equal(code('not json at all'), 'bad');
  assert.equal(code('{"some":"other file"}'), 'bad');
  assert.equal(code('[]'), 'bad');
  assert.equal(code(JSON.stringify({ format: B.FORMAT, version: B.VERSION + 1 })), 'newer');
  assert.equal(code(JSON.stringify({ format: B.FORMAT, version: B.VERSION })), 'read');
});

test('broken records, words outside the dictionary and keys in an edited file are skipped', () => {
  const r = B.readBackup(JSON.stringify({ format: B.FORMAT, version: 1,
    words: [word('en1', 1), { id: 'en2' }, null, 'x', word('t:hello', 1, { entry: null })],
    notes: [{ id: 'n1', modified: 1 }, { id: 'n2', note: 'ok', modified: 1 }],
    settings: { rk: 'should not come in', speed: '1' } }));
  assert.deepEqual(r.words.map(w => w.id), ['en1']);
  assert.deepEqual(r.notes.map(n => n.id), ['n2']);
  assert.deepEqual(r.settings, { speed: '1' });
});

test('restoring keeps whichever copy of a word changed last', () => {
  const local = [word('en1', 10), word('en2', 10)];
  const incoming = [word('en1', 5), word('en2', 20), word('en3', 1)];
  assert.deepEqual(B.newer(local, incoming).map(w => w.id + '@' + w.modified), ['en2@20', 'en3@1']);
  assert.deepEqual(B.newer(local, local), []);
});

test('the drill count keeps the larger number; other values keep the newer copy', () => {
  const local = [{ id: 'drills', value: 50, modified: 1 }, { id: 'other', value: 'a', modified: 5 }];
  assert.deepEqual(B.mergeMeta(local, [{ id: 'drills', value: 80, modified: 1 }], 9), [{ id: 'drills', value: 80, modified: 9 }]);
  assert.deepEqual(B.mergeMeta(local, [{ id: 'drills', value: 20, modified: 99 }], 9), []);
  assert.deepEqual(B.mergeMeta(local, [{ id: 'other', value: 'b', modified: 7 }]), [{ id: 'other', value: 'b', modified: 7 }]);
  assert.deepEqual(B.mergeMeta([], [{ id: 'drills', value: 3, modified: 1 }], 9), [{ id: 'drills', value: 3, modified: 9 }]);
});
