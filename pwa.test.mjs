/* Tests for installing the app to the home screen (spec 3.2, PWA). Run: node --test
   They check that the manifest and its icons are in place, and that the service worker saves every
   file the app needs to open without a connection. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

/* Width and height of a PNG file, from its header. */
function pngSize(file) {
  const b = readFileSync(file);
  assert.equal(b.toString('ascii', 1, 4), 'PNG', file + ' is not a PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}
const swFiles = () => JSON.parse('[' + readFileSync('sw.js', 'utf8').match(/const FILES = \[([\s\S]*?)\];/)[1].replace(/'/g, '"').replace(/,\s*$/, '') + ']');

test('the manifest describes an installable app and its icons exist at their sizes', () => {
  const m = JSON.parse(readFileSync('manifest.webmanifest', 'utf8'));
  assert.ok(m.name && m.short_name);
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, './');
  const png = m.icons.filter(i => i.type === 'image/png');
  for (const i of m.icons) assert.ok(existsSync(i.src), i.src);
  for (const i of png) assert.deepEqual(pngSize(i.src).join('x'), i.sizes, i.src);
  assert.ok(png.some(i => i.sizes === '192x192') && png.some(i => i.sizes === '512x512'));
  assert.ok(m.icons.some(i => i.purpose === 'maskable'));
});

test('the page links the manifest and the iPhone icon', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.match(html, /<link rel="manifest" href="manifest.webmanifest">/);
  const apple = html.match(/<link rel="apple-touch-icon" href="([^"]+)">/)[1];
  assert.deepEqual(pngSize(apple), [180, 180]);
});

test('every file the service worker saves exists', () => {
  for (const f of swFiles()) if (f !== './') assert.ok(existsSync(f), f);
});

test('the service worker saves every module the app loads, so it opens offline', () => {
  const seen = new Set(), todo = ['app.js'];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const m of readFileSync(f, 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)[^'"]*from\s+'(\.[^']+)'/g)) todo.push(normalize(join(dirname(f), m[1])));
  }
  const saved = new Set(swFiles());
  assert.deepEqual([...seen].filter(f => !saved.has(f)), []);
  const pack = readFileSync('packs/en-he/pack.js', 'utf8');
  for (const m of pack.matchAll(/'(packs\/[^']+\.json)'/g)) assert.ok(saved.has(m[1]), m[1]);
});
