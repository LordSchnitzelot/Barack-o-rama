/* Backup export and import (spec 8, Storage; spec 9): the learner's progress as one file they can
   keep, because browser data can be cleared. Plain code with no screen, tested by backup.test.mjs;
   app.js reads and writes the file, store.js the database.

   A backup file is JSON:
     { format: 'speaking-app-backup', version: 1, exported: '2026-10-31T21:00:00.000Z',
       words: [ My words records (words.js) ], notes: [ weak-spot notes ],
       meta: [ { id: 'drills', value: 120, modified } ], settings: { ...without API keys } }

   Restoring merges by id, using the last-modified time every record has (spec 8): a record from
   the backup is saved only if this device does not have it, or has an older copy. So restoring an
   old backup never undoes newer progress, and two devices can be combined. */

export const FORMAT = 'speaking-app-backup';
export const VERSION = 1;
/* Settings that never go into a backup: the API keys, since a backup file may be shared. */
export const SECRET_SETTINGS = ['rk', 'gk'];

export function makeBackup({ words = [], notes = [], meta = [], settings = {} }, now = Date.now()) {
  const safe = Object.fromEntries(Object.entries(settings).filter(([k]) => !SECRET_SETTINGS.includes(k)));
  return { format: FORMAT, version: VERSION, exported: new Date(now).toISOString(), words, notes, meta, settings: safe };
}

/* speaking-backup-2026-10-31.json */
export const fileName = (now = Date.now()) => 'speaking-backup-' + new Date(now).toISOString().slice(0, 10) + '.json';

/* A problem with a backup file. code: 'bad' (not a backup from this app) or 'newer' (made by a
   newer version of the app, which this one may not understand). */
export class BackupError extends Error {
  constructor(code) { super(code === 'newer' ? 'backup from a newer version' : 'not a backup file'); this.code = code; }
}

/* Reads a backup file's text. Records without an id or a last-modified time are skipped, and so are
   words that are not dictionary entries (only those are kept, spec 3.2). */
export function readBackup(text) {
  let d;
  try { d = JSON.parse(text); } catch (e) { throw new BackupError('bad'); }
  if (!d || d.format !== FORMAT || !Number.isInteger(d.version)) throw new BackupError('bad');
  if (d.version > VERSION) throw new BackupError('newer');
  const records = a => (Array.isArray(a) ? a : []).filter(r => r && typeof r === 'object' && typeof r.id === 'string' && Number.isFinite(r.modified));
  const settings = d.settings && typeof d.settings === 'object' && !Array.isArray(d.settings) ? d.settings : {};
  return {
    words: records(d.words).filter(r => typeof r.entry === 'string' && r.entry),
    notes: records(d.notes).filter(r => typeof r.note === 'string'),
    meta: records(d.meta),
    settings: Object.fromEntries(Object.entries(settings).filter(([k]) => !SECRET_SETTINGS.includes(k))),
  };
}

/* The incoming records to save: new ones, and ones changed more recently than this device's copy. */
export function newer(local, incoming) {
  const have = new Map(local.map(r => [r.id, r]));
  return incoming.filter(r => !have.has(r.id) || r.modified > have.get(r.id).modified);
}

/* The single values to save. The drill count (spec 8: review times are counted in drills) keeps
   the larger number, so words never wait longer than they would have on either device. */
export function mergeMeta(local, incoming, now = Date.now()) {
  const have = new Map(local.map(r => [r.id, r]));
  const out = [];
  for (const r of incoming) {
    const mine = have.get(r.id);
    if (r.id === 'drills') {
      const n = Math.max(Number(r.value) || 0, Number(mine && mine.value) || 0);
      if (!mine || n !== mine.value) out.push({ id: 'drills', value: n, modified: now });
    } else if (!mine || r.modified > mine.modified) out.push(r);
  }
  return out;
}
