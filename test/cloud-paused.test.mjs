// Sync on hold in Joplin (src/cloudInbox.ts, src/shareLinks.ts): the server answers 403 'device-paused' to everything.
// Joplin then asks once, stays quiet for 30 minutes (Check now still asks at once), says why, and the share menu says the
// same. Runs the real plugin code against the small Joplin in memory (scripts/fake-joplin-api) and a fake server.
import assert from 'node:assert/strict';
import { after, before, beforeEach, mock, test } from 'node:test';
import { build } from 'esbuild';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bytesToBase64 } from '../src/cloud-shared/crypto.mjs';

const root = new URL('..', import.meta.url);
const CREDENTIALS = { url: 'http://127.0.0.1:9', vaultId: '11111111-1111-4111-8111-111111111111', deviceId: '22222222-2222-4222-8222-222222222222', token: bytesToBase64(new Uint8Array(32).fill(7)), vaultKey: bytesToBase64(new Uint8Array(32).fill(9)) };
let plugin, state, requests, shown, buttons;

before(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'jd-paused-test-'));
  // The fake Joplin, plus the dialogs the cloud button opens: it answers with the button the test chose.
  const fake = join(dir, 'fake');
  mkdirSync(fake);
  const original = fileURLToPath(new URL('scripts/fake-joplin-api/index.js', root)).replace(/\\/g, '/');
  writeFileSync(join(fake, 'index.js'), `import joplin from '${original}';
joplin.views.dialogs = { create: async () => 'dialog', setHtml: async (_id, html) => { globalThis.__shown.push(html); }, setButtons: async () => {}, open: async () => ({ id: globalThis.__button, formData: {} }) };
export default joplin;`);
  writeFileSync(join(fake, 'types.js'), `export * from '${fileURLToPath(new URL('scripts/fake-joplin-api/types.js', root)).replace(/\\/g, '/')}';
export const ToastType = { Info: 'info', Success: 'success', Error: 'error' };`);
  const out = join(dir, 'plugin.mjs');
  await build({
    stdin: { contents: "export * from './src/cloudInbox.ts'; export * from './src/shareLinks.ts'; export { PAUSED } from './src/paused.ts';", resolveDir: fileURLToPath(root) },
    outfile: out, bundle: true, format: 'esm', platform: 'node', target: 'es2022', logLevel: 'error', alias: { api: fake },
  });
  globalThis.__shown = shown = [];
  plugin = await import(pathToFileURL(out).href);
  state = globalThis.__joplin;
});

beforeEach(() => {
  requests = [];
  shown.length = 0;
  globalThis.__button = 'check';
  state.settings.cloudCredentials = JSON.stringify(CREDENTIALS);
  state.notes.set('n1', { id: 'n1', title: 'Tent', body: 'Tent, slaapzak', updated_time: 5, deleted_time: 0 });
  // The server holds sync on this device: every request is refused with the code the apps know.
  globalThis.fetch = async (url, init = {}) => {
    requests.push({ url: String(url), method: init.method || 'GET' });
    return new Response(JSON.stringify({ error: 'Sync is on hold on this device.', code: 'device-paused' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  };
});

after(() => mock.timers.reset());

// Lets the plugin's own async work finish; setImmediate is not one of the mocked timers.
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve)); };

test('both texts say what to do and where', () => {
  for (const text of Object.values(plugin.PAUSED)) assert.match(text, /app\.jotdrop\.net/), assert.match(text, /Devices/);
  assert.match(plugin.PAUSED.en, /30 minutes/);
  assert.match(plugin.PAUSED.nl, /30 minuten/);
});

test('the share menu and a new link say the same, in the language of Joplin', async () => {
  plugin.setupShareLinks(plugin.credentials, async () => false);
  assert.deepEqual(await plugin.makeLink('n1', 'copy', 7), { problem: plugin.PAUSED.nl });
  // The empty lists keep the board's list of links from failing on a menu that only has the text.
  assert.deepEqual(await plugin.shareInfo(''), { connected: true, problem: plugin.PAUSED.nl, links: [], lists: [] });
});

test('Check now asks at once and shows the text; the board chip shows a problem', async () => {
  const answer = await plugin.openCloud(async () => {});
  assert.equal(requests.length, 1);
  assert.equal(answer.message, plugin.PAUSED.nl);
  assert.equal((await plugin.cloudStatus()).problem, true);
  await plugin.openCloud(async () => {});
  assert.equal(requests.length, 2, 'a second Check now asks again, however soon');
  assert.ok(shown.at(-1).includes(plugin.PAUSED.nl), 'the status window shows the text too');
});

test('on hold Joplin asks once, then waits 30 minutes before the next look', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 1_800_000_000_000 });
  plugin.startCloud(async () => 'inbox', async () => {});
  mock.timers.tick(2000);
  await settle();
  assert.equal(requests.length, 1, 'the first look at start');
  for (let seconds = 30; seconds < 29 * 60; seconds += 30) { mock.timers.tick(30000); await settle(); }
  assert.equal(requests.length, 1, 'quiet for the first 29 minutes');
  for (let seconds = 29 * 60; seconds <= 31 * 60; seconds += 30) { mock.timers.tick(30000); await settle(); }
  assert.equal(requests.length, 2, 'one more look after 30 minutes');
  mock.timers.reset();
});
