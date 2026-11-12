// Ask JotDrop in Joplin (src/ai.ts) against a small Joplin in memory (scripts/fake-joplin-api) and a fake AI service in the
// OpenAI form: which notes go along, every tool on Joplin's data, confirm and decline, and that the key never shows.
import assert from 'node:assert/strict';
import { before, beforeEach, test } from 'node:test';
import { build } from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = new URL('..', import.meta.url);
const KEY = 'sk-test-0123456789abcdefSECRET';
const FOLDER = 'folder1';
let ai, joplin, answer;
let calls, sent, service, helperCalls, linked;

before(async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'jd-ai-test-')), 'ai.mjs');
  await build({ entryPoints: [fileURLToPath(new URL('src/ai.ts', root))], outfile: out, bundle: true, format: 'esm', platform: 'node', target: 'es2022', logLevel: 'error', alias: { api: fileURLToPath(new URL('scripts/fake-joplin-api', root)) } });
  ai = await import(pathToFileURL(out).href);
  joplin = globalThis.__joplin;
});

// The fake AI service: logs every request, answers with tool calls from the request's words.
function scripted(body) {
  const messages = body.messages;
  const last = messages[messages.length - 1];
  if (last.role === 'tool') return { content: 'Klaar. **Melk** en *Brood* staan erop.' };
  const text = last.content;
  const request = text.split('Request from the user:\n').pop().toLowerCase();
  const idOf = (title) => (new RegExp(`<note id="([^"]+)">\\nTitle: ${title}`).exec(text) || [])[1];
  const tools = (...list) => ({ content: null, tool_calls: list.map(([name, args], i) => ({ id: `c${i}`, type: 'function', function: { name, arguments: JSON.stringify(args) } })) });
  if (request.includes('melk')) return tools(['append_to_note', { id: idOf('Boodschappen'), items: ['Melk', 'Brood'] }], ['create_note', { title: 'Paklijst', items: ['Tent', 'Slaapzak'], color: 'blue', label: 'thuis' }], ['delete_note', { id: idOf('Boodschappen') }]);
  if (request.includes('herinner')) return tools(['set_reminder', { id: idOf('Wifi bij oma'), at: '2026-11-12T10:00' }]);
  if (request.includes('garantie')) return tools(['set_expiry', { id: idOf('Garantie wasmachine'), date: '2028-11-09' }]);
  if (request.includes('labels')) return tools(['set_labels', { id: idOf('Wifi bij oma'), labels: ['Familie', 'thuis'] }]);
  if (request.includes('herschrijf')) return tools(['replace_note_text', { id: idOf('Boodschappen'), text: '# Boodschappen\n\n- [ ] kaas' }]);
  if (request.includes('toon')) return tools(['open_note', { id: idOf('Wifi bij oma') }]);
  if (request.includes('summarize')) return { content: 'Samenvatting: appeltaart.' };
  return { content: 'De code is 4711, uit Wifi bij oma.' };
}

globalThis.fetch = async (url, init = {}) => {
  if (init.signal?.aborted) throw init.signal.reason ?? new DOMException('Stopped.', 'AbortError');
  // A recording for OpenAI goes as multipart bytes; everything else is JSON.
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body ?? null;
  calls.push({ url, headers: init.headers, body });
  if (!String(url).startsWith('http://127.0.0.1') && init.headers?.Authorization !== `Bearer ${KEY}`) return new Response(JSON.stringify({ error: { message: `Incorrect API key provided: ${String(init.headers?.Authorization).slice(7)}` } }), { status: 401 });
  if (String(url).endsWith('/models')) return Response.json({ data: [{ id: 'gpt-6-luna' }, { id: 'gpt-6.1-terra' }, { id: 'text-embedding-9' }] });
  if (String(url).endsWith('/audio/transcriptions')) return Response.json({ text: ' Melk en brood halen. ', usage: { type: 'duration', seconds: 7 } });
  const words = (content) => (typeof content === 'string' ? content : content.filter((part) => part.type === 'text').map((part) => part.text).join('\n'));
  sent.push(body.messages.filter((m) => m.role === 'user').map((m) => words(m.content)).join('\n'));
  const message = { role: 'assistant', ...service(body) };
  return Response.json({ choices: [{ index: 0, message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 120, completion_tokens: 30 } });
};

function seed() {
  joplin.notes.clear();
  joplin.tags.clear();
  joplin.links.clear();
  joplin.resources.clear();
  joplin.posted.length = 0;
  joplin.onPost = null;
  joplin.settings = {};
  const add = (id, title, body, extra = {}) => joplin.notes.set(id, { id, title, body, parent_id: FOLDER, user_data: '', is_conflict: 0, deleted_time: 0, encryption_applied: 0, todo_due: 0, updated_time: ++joplin.clock, ...extra });
  add('n1', 'Boodschappen', '- [ ] eieren\n- [ ] melk\n');
  add('n2', 'Wifi bij oma', 'De wifi-code is 4711.');
  add('n3', 'Appeltaart', 'Recept: appels, deeg, 60 minuten op 180 graden.');
  add('n4', 'Oude melklijst', 'melk in de prullenbak', { deleted_time: 5 });
  add('n5', 'JotDrop', 'melk ```jotdrop-board', { user_data: JSON.stringify({ 'net.jotdrop.joplin': { board: { v: true, t: 1, d: 0 } } }) });
  add('n6', 'Melk conflict', 'melk conflict', { is_conflict: 1 });
  add('n7', 'Gedeelde melk', 'melk met de buren');
  add('n8', 'Garantie wasmachine', 'Bon van de wasmachine, garantie twee jaar.');
  add('n9', 'melk versleuteld', 'melk', { encryption_applied: 1 });
  joplin.tags.set('tag1', { id: 'tag1', title: 'thuis' });
  joplin.links.add('tag1/n2');
  // Version 2: a note with a photo, a PDF, a recording, a drawing, a HEIC photo, a photo too large and a link to a note.
  const file = (id, title, mime, bytes, size = bytes.length) => joplin.resources.set(id, { id, title, mime, file_extension: title.split('.').pop(), size, bytes });
  file(R.photo, 'bon.jpg', 'image/jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0]));
  file(R.pdf, 'scan.pdf', 'application/pdf', new TextEncoder().encode('%PDF-1.4 bon'));
  file(R.memo, 'memo.m4a', 'audio/mp4', new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]));
  file(R.drawing, 'drawing-2026-11-12 101500.png', 'image/png', new Uint8Array([137, 80]));
  file(R.heic, 'IMG_1.heic', 'image/heic', new Uint8Array([1, 2, 3]));
  file(R.big, 'groot.jpg', 'image/jpeg', new Uint8Array([0xff, 0xd8]), 5 * 1048576);
  add('n10', 'Bon wasmachine', `Gekocht.\n\n![bon.jpg](:/${R.photo})\n[scan.pdf](:/${R.pdf})\n[memo.m4a](:/${R.memo})\n![drawing](:/${R.drawing})\n![IMG_1.heic](:/${R.heic})\n![groot.jpg](:/${R.big})\n[Wifi](:/${'b'.repeat(32)})\n`);
  joplin.notes.get('n7').body += `\n![bon.jpg](:/${R.photo})`;
}

// Resource ids are 32 hex characters, as in Joplin.
const R = { photo: '1'.repeat(32), pdf: '2'.repeat(32), memo: '3'.repeat(32), drawing: '4'.repeat(32), heic: '5'.repeat(32), big: '6'.repeat(32) };
const b64 = (bytes) => Buffer.from(bytes).toString('base64');

beforeEach(async () => {
  seed();
  calls = [];
  sent = [];
  service = scripted;
  helperCalls = [];
  linked = new Set(['n7']);
  await ai.registerAiSettings();
  answer = ai.setupAsk({
    async allPages(path, query = {}) { const out = []; for (let page = 1; ; page++) { const r = await globalThis.__joplinData.get(path, { ...query, page, limit: 100 }); out.push(...r.items); if (!r.has_more) return out; } },
    isBoard: (note) => note.id === 'n5',
    boardFolderId: async () => FOLDER,
    setReminder: async (id, due) => { helperCalls.push(['setReminder', id, due]); },
    setPaper: async (id, drawer, expires, warn) => { helperCalls.push(['setPaper', id, drawer, expires, warn]); },
    tagId: async (title) => ([...joplin.tags.values()].find((tag) => tag.title === title) || await globalThis.__joplinData.post(['tags'], null, { title })).id,
    hasListLink: (id) => linked.has(id),
    notifyBoards: async () => {},
    resourceBytes: async (id) => { helperCalls.push(['resourceBytes', id]); const found = joplin.resources.get(id); if (!found?.bytes) throw new Error('not here'); return found.bytes; },
    colors: new Set(['red', 'blue']),
  });
  // A change nobody answers would wait forever: unless a test says otherwise, the answer is no.
  confirmAll(false);
});

// The test's own way into the fake data API (the bundle holds the same object).
globalThis.__joplinData = null;
before(async () => {
  const fake = await import(new URL('../scripts/fake-joplin-api/index.js', import.meta.url).href);
  globalThis.__joplinData = fake.default.data;
});

const on = () => answer({ type: 'aiSave', provider: 'openai', key: KEY, model: '', baseUrl: '', includeShared: false });
const ask = (request, extra = {}) => answer({ type: 'aiAsk', request, token: 't1', ...extra }, 'view1');
// Answers every confirmation with yes or no, a moment later, as a click would.
const confirmAll = (yes, beforeAnswer) => { joplin.onPost = (message) => { if (message.type === 'aiConfirm') setTimeout(async () => { await beforeAnswer?.(message); await answer({ type: 'aiConfirmAnswer', id: message.id, yes }); }, 5); }; };
const everything = () => JSON.stringify({ posted: joplin.posted, settingsShown: null });

test('settings: no key, no AI; the key is saved but never comes back', async () => {
  let shown = await answer({ type: 'aiSettings' });
  assert.equal(shown.provider, '');
  assert.equal(shown.hasKey, false);
  assert.match((await answer({ type: 'aiSave', provider: 'openai', key: '' })).error, /Paste your API key first/);
  shown = await on();
  assert.equal(shown.hasKey, true);
  assert.ok(!JSON.stringify(shown).includes(KEY));
  assert.equal(joplin.settings.aiKey, KEY);
  // An empty key field keeps the saved key of the same service.
  await answer({ type: 'aiSave', provider: 'openai', key: '', model: 'gpt-6.1-terra' });
  assert.equal(joplin.settings.aiKey, KEY);
  assert.equal(joplin.settings.aiModel, 'gpt-6.1-terra');
  // Another service starts without the key.
  assert.match((await answer({ type: 'aiSave', provider: 'anthropic', key: '' })).error, /Paste your API key first/);
  shown = await answer({ type: 'aiRemove' });
  assert.equal(shown.provider, '');
  assert.equal(joplin.settings.aiKey, '');
});

test('off: nothing goes out without a service', async () => {
  const result = await ask('wat is de wifi-code bij oma?');
  assert.equal(result.stop, 'off');
  assert.equal(calls.length, 0);
});

test('what goes along: notes with words of the request, never trash, board, conflict, undecrypted or list-link notes', async () => {
  await on();
  const preview = await answer({ type: 'aiPreview', request: 'zet melk op de boodschappen' });
  assert.deepEqual(preview.notes.map((note) => note.id), ['n1']);
  await answer({ type: 'aiSave', provider: 'openai', key: '', includeShared: true });
  const shared = await answer({ type: 'aiPreview', request: 'zet melk op de boodschappen' });
  assert.deepEqual(shared.notes.map((note) => note.id).sort(), ['n1', 'n7']);
  const kept = await answer({ type: 'aiPreview', request: 'zet melk op de boodschappen', excluded: ['n1'] });
  assert.deepEqual(kept.notes.map((note) => note.id), ['n7']);
});

test('a request with changes: the new note at once, the change after yes, delete refused, the key only in the header', async () => {
  await on();
  confirmAll(true);
  const result = await ask('zet melk en brood op de boodschappen en maak een paklijst');
  assert.equal(result.stop, 'done');
  assert.equal(joplin.notes.get('n1').body, '- [ ] eieren\n- [ ] melk\n- [ ] Melk\n- [ ] Brood\n');
  const made = [...joplin.notes.values()].find((note) => note.title === 'Paklijst');
  assert.equal(made.body, '- [ ] Tent\n- [ ] Slaapzak\n');
  assert.equal(made.parent_id, FOLDER);
  assert.equal(JSON.parse(made.user_data)['net.jotdrop.joplin'].color.v, 'blue');
  assert.ok(joplin.links.has(`tag1/${made.id}`));
  assert.deepEqual(result.actions.map((a) => [a.tool, a.status]), [['append_to_note', 'done'], ['create_note', 'done'], ['delete_note', 'refused']]);
  assert.equal(result.actions[1].made, made.id);
  assert.equal(result.actions[0].title, 'Boodschappen');
  assert.equal(result.first, 1);
  assert.match(result.answer, /Klaar/);
  assert.deepEqual(result.usage, { input: 240, output: 60 });
  // What went out: only the shopping list; nothing from trash, board, conflict, encrypted or list-link notes.
  const out = sent.join('\n');
  assert.match(out, /<note id="n1">/);
  for (const id of ['n4', 'n5', 'n6', 'n7', 'n9']) assert.ok(!out.includes(`<note id="${id}">`), id);
  assert.ok(!out.includes('prullenbak') && !out.includes('jotdrop-board') && !out.includes('buren'));
  assert.ok(calls.every((call) => call.url.startsWith('https://api.openai.com/v1/') && call.headers.Authorization === `Bearer ${KEY}`));
  assert.ok(calls.every((call) => !JSON.stringify(call.body).includes(KEY)));
  // The board saw the confirmation, never the key.
  assert.equal(joplin.posted[0].view, 'view1');
  assert.equal(joplin.posted[0].message.heading, 'Add to "Boodschappen"');
  assert.ok(joplin.posted[0].message.lines.some((line) => line.sign === '+' && line.text === '- [ ] Melk'));
  assert.ok(!everything().includes(KEY) && !JSON.stringify(result).includes(KEY));
});

test('no is final: the note stays as it was', async () => {
  await on();
  confirmAll(false);
  const before = joplin.notes.get('n1').body;
  const result = await ask('zet melk op de boodschappen');
  assert.equal(joplin.notes.get('n1').body, before);
  assert.equal(result.actions[0].status, 'declined');
});

test('a note that changed while the AI worked is left alone', async () => {
  await on();
  confirmAll(true, () => globalThis.__joplinData.put(['notes', 'n1'], null, { body: 'Zelf veranderd' }));
  const result = await ask('zet melk op de boodschappen');
  assert.equal(joplin.notes.get('n1').body, 'Zelf veranderd');
  assert.equal(result.actions[0].status, 'failed');
});

test('a note kept out does not go, and a list-link note goes only when allowed', async () => {
  await on();
  await ask('wat staat er bij melk', { excluded: ['n1'] });
  assert.ok(!sent[0].includes('<note id="n1">'));
  await answer({ type: 'aiSave', provider: 'openai', key: '', includeShared: true });
  sent = [];
  await ask('wat staat er bij melk');
  assert.match(sent[0], /<note id="n7">/);
});

test('summarize: only that note goes', async () => {
  await on();
  const result = await ask('Summarize the note "Appeltaart" in a few short lines.', { noteId: 'n3', mode: 'summarize' });
  assert.equal(result.answer, 'Samenvatting: appeltaart.');
  assert.equal((sent[0].match(/<note id=/g) || []).length, 1);
  assert.match(sent[0], /<note id="n3">/);
  assert.equal(await answer({ type: 'aiAddBelow', id: 'n3', text: result.answer }), true);
  assert.equal(joplin.notes.get('n3').body, 'Recept: appels, deeg, 60 minuten op 180 graden.\n\nSamenvatting: appeltaart.\n');
});

test('reminder, expiry, labels, new text and open, each through Joplin', async () => {
  await on();
  confirmAll(true);
  await ask('herinner me aan de wifi van oma');
  assert.deepEqual(helperCalls.shift(), ['setReminder', 'n2', new Date('2026-11-12T10:00').getTime()]);
  await ask('de garantie van de wasmachine');
  assert.deepEqual(helperCalls.shift(), ['setPaper', 'n8', 'paper drawer', '2028-11-09', '1w']);
  joplin.notes.get('n8').todo_due = 123;
  await ask('de garantie van de wasmachine');
  assert.deepEqual(helperCalls.shift(), ['setPaper', 'n8', 'paper drawer', '2028-11-09', ''], 'a reminder the note has stays');
  await ask('labels voor wifi bij oma');
  assert.deepEqual([...joplin.tags.values()].filter((tag) => joplin.links.has(`${tag.id}/n2`)).map((tag) => tag.title).sort(), ['familie', 'thuis']);
  await ask('herschrijf de boodschappen');
  assert.equal(joplin.notes.get('n1').body, '- [ ] kaas\n');
  const shown = await ask('toon de wifi van oma');
  assert.equal(shown.open, 'n2');
});

test('a wrong key: a plain message without the key, and stop ends a waiting change', async () => {
  await answer({ type: 'aiSave', provider: 'openai', key: 'sk-wrong-key-123456789xyz' });
  const result = await ask('wat is de wifi-code bij oma?');
  assert.equal(result.stop, 'error');
  assert.match(result.problem, /did not accept the key/);
  assert.ok(!result.problem.includes('sk-wrong-key-123456789xyz'));
  await on();
  joplin.onPost = (message) => { if (message.type === 'aiConfirm') setTimeout(() => answer({ type: 'aiStop', token: message.token }), 5); };
  const before = joplin.notes.get('n1').body;
  const stopped = await ask('zet melk op de boodschappen');
  assert.equal(stopped.stop, 'cancelled');
  assert.equal(joplin.notes.get('n1').body, before);
});

test('test and load models: groups, the default picked, no key in the answer', async () => {
  const list = await answer({ type: 'aiModels', provider: 'openai', key: KEY, model: '' });
  assert.equal(list.count, 2, 'embeddings are not chat models');
  assert.equal(list.preferred, 'gpt-6-luna');
  assert.ok(!JSON.stringify(list).includes(KEY));
  assert.match((await answer({ type: 'aiModels', provider: 'openai', key: 'sk-wrong-key-123456789xyz' })).error, /did not accept the key/);
});

test('OpenRouter: the model list is public, so a wrong key is caught by the key check and no list is asked', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, headers: init.headers });
    if (String(url).endsWith('/models')) return Response.json({ data: [{ id: 'openrouter/some-model' }] });
    if (String(url).endsWith('/key')) return init.headers?.Authorization === `Bearer ${KEY}` ? Response.json({ data: { label: 'test' } }) : new Response(JSON.stringify({ error: { message: 'User not found.' } }), { status: 401 });
    throw new Error(`unexpected ${url}`);
  };
  try {
    const wrong = await answer({ type: 'aiModels', provider: 'openrouter', key: 'sk-or-wrong-key-123456789' });
    assert.match(wrong.error, /did not accept the key/);
    assert.ok(!calls.some((call) => String(call.url).endsWith('/models')), 'no model list for a wrong key');
    assert.ok(!JSON.stringify(wrong).includes('sk-or-wrong-key-123456789'));
    calls.length = 0;
    const good = await answer({ type: 'aiModels', provider: 'openrouter', key: KEY });
    assert.equal(good.count, 1);
    assert.deepEqual(calls.map((call) => String(call.url).split('/').pop()), ['key', 'models']);
  } finally {
    globalThis.fetch = real;
  }
});

test('an own address on this computer counts as local', async () => {
  await answer({ type: 'aiSave', provider: 'custom', key: '', baseUrl: 'http://127.0.0.1:9871/v1' });
  service = () => ({ content: 'Lokaal.' });
  const result = await ask('wat is de wifi-code bij oma?');
  assert.equal(result.local, true);
  assert.equal(result.service, 'http://127.0.0.1:9871/v1');
});

test('on Joplin for Android an error about Ollama says "this phone"', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  try {
    assert.match((await answer({ type: 'aiModels', provider: 'ollama' })).error, /on this computer, at http:\/\/127\.0\.0\.1:11434/);
    joplin.platform = 'mobile';
    await ai.registerAiSettings();
    assert.match((await answer({ type: 'aiModels', provider: 'ollama' })).error, /on this phone, at http:\/\/127\.0\.0\.1:11434/);
  } finally {
    globalThis.fetch = real;
    joplin.platform = undefined;
    await ai.registerAiSettings();
  }
});

test('the window and the README tell where the key is on each platform', () => {
  const ask = readFileSync(new URL('src/board/ask.js', root), 'utf8');
  assert.match(ask, /Your key stays on this computer, in Joplin\\'s secure storage/);
  assert.match(ask, /Your key stays on this phone, in Joplin\\'s own app data\. Joplin does not encrypt it there/);
  assert.match(ask, /On this phone, notes with a live list link can go along, because JotDrop cannot tell which notes have one here/);
  assert.match(ask, /if \(mobile\(\)\) \{\s*parts\.push\(h\('p'/, 'no list-link switch on the phone');
  const readme = readFileSync(new URL('README.md', root), 'utf8');
  assert.match(readme, /On \*\*Joplin for Android\*\* Ask JotDrop works the same way/);
  assert.match(readme, /The key is not encrypted on the phone/);
  assert.match(readme, /Notes with a live list link can go along/);
  assert.ok(!/On Android it comes later/.test(readme));
});

test('files: a note lists its photos, PDFs and recordings, never a drawing, with why one cannot go', async () => {
  await on();
  assert.deepEqual((await ai.aiFileKinds(joplin.notes.get('n10').body)).sort(), ['audio', 'image', 'pdf']);
  assert.deepEqual(await ai.aiFileKinds('Geen bijlagen.'), []);
  const { files } = await answer({ type: 'aiFiles', noteId: 'n10' });
  assert.deepEqual(files.map((file) => [file.name, file.kind]), [['bon.jpg', 'image'], ['scan.pdf', 'pdf'], ['memo.m4a', 'audio'], ['IMG_1.heic', 'image'], ['groot.jpg', 'image']]);
  const problem = Object.fromEntries(files.map((file) => [file.name, file.problem]));
  assert.equal(problem['bon.jpg'], '');
  assert.equal(problem['scan.pdf'], '');
  assert.equal(problem['memo.m4a'], 'OpenAI cannot listen to recordings. Gemini can.');
  assert.equal(problem['IMG_1.heic'], 'Joplin sends JPEG, PNG, WebP and GIF photos only.');
  assert.equal(problem['groot.jpg'], 'Larger than 4 MiB, too large to send.');
  // Writing out a recording is another thing: OpenAI can, Claude cannot.
  const memo = await answer({ type: 'aiFiles', noteId: 'n10', action: 'transcribe' });
  assert.deepEqual(memo.files.map((file) => [file.name, file.problem]), [['memo.m4a', '']]);
  await answer({ type: 'aiSave', provider: 'anthropic', key: KEY });
  assert.equal((await answer({ type: 'aiFiles', noteId: 'n10', action: 'transcribe' })).files[0].problem, 'Claude cannot listen to recordings. Gemini and OpenAI can.');
  assert.deepEqual((await answer({ type: 'aiFiles', noteId: 'n10', action: 'receipt' })).files.map((file) => file.kind), ['image', 'pdf', 'image', 'image']);
  assert.ok(!helperCalls.some(([name]) => name === 'resourceBytes'), 'listing reads no bytes');
});

test('a question about a note sends no file unless it is ticked, and then only that one', async () => {
  await on();
  service = () => ({ content: 'Een bon van de wasmachine.' });
  const plain = await ask('wat staat er in de bon van de wasmachine?', { noteId: 'n10' });
  assert.equal(plain.stop, 'done');
  assert.deepEqual(plain.files, []);
  assert.ok(!JSON.stringify(calls).includes(b64(joplin.resources.get(R.photo).bytes)), 'no file without a tick');
  assert.ok(!helperCalls.some(([name]) => name === 'resourceBytes'));
  calls = [];
  const ticked = await ask('wat staat er in de bon van de wasmachine?', { noteId: 'n10', files: [R.photo] });
  assert.equal(ticked.stop, 'done');
  assert.deepEqual(ticked.files, [{ name: 'bon.jpg', kind: 'image', bytes: 4 }]);
  const parts = calls[0].body.messages[1].content;
  assert.deepEqual(parts.filter((part) => part.type === 'image_url').map((part) => part.image_url.url), [`data:image/jpeg;base64,${b64(joplin.resources.get(R.photo).bytes)}`]);
  assert.ok(!JSON.stringify(calls).includes(b64(joplin.resources.get(R.pdf).bytes)), 'the PDF stayed home');
  assert.ok(calls[0].body.tools?.length, 'a question keeps its tools');
});

test('a file that is not in the note, or cannot go, is refused before anything goes out', async () => {
  await on();
  assert.match((await ask('lees dit', { noteId: 'n3', files: [R.photo] })).error, /no longer in this note/);
  assert.match((await ask('lees dit', { noteId: 'n10', files: [R.drawing] })).error, /no longer in this note/);
  assert.match((await ask('lees dit', { noteId: 'n10', files: [R.heic] })).error, /IMG_1\.heic: Joplin sends JPEG, PNG, WebP and GIF photos only/);
  assert.match((await ask('lees dit', { noteId: 'n10', files: [R.big] })).error, /groot\.jpg: Larger than 4 MiB/);
  assert.match((await ask('lees dit', { noteId: 'n10', files: [R.memo] })).error, /OpenAI cannot listen to recordings/);
  // Joplin's size can be wrong, or the file not synced yet: the bytes are checked again, and a missing file says so.
  joplin.resources.get(R.photo).bytes = new Uint8Array(4 * 1048576 + 1);
  assert.match((await ask('lees dit', { noteId: 'n10', files: [R.photo] })).error, /bon\.jpg is larger than 4 MiB/);
  joplin.resources.get(R.pdf).bytes = undefined;
  assert.match((await ask('lees dit', { noteId: 'n10', files: [R.pdf] })).error, /scan\.pdf is not on this computer yet/);
  assert.equal(calls.length, 0, 'nothing went out');
});

test('a note with a live list link keeps its files home', async () => {
  await on();
  assert.deepEqual((await answer({ type: 'aiFiles', noteId: 'n7' })).files, []);
  assert.match((await ask('lees dit', { noteId: 'n7', files: [R.photo] })).error, /live list link/);
  await answer({ type: 'aiSave', provider: 'openai', key: '', includeShared: true });
  assert.equal((await answer({ type: 'aiFiles', noteId: 'n7' })).files.length, 1);
});

test('transcribe: the recording alone to the own address of OpenAI, no notes, no tools', async () => {
  await on();
  const result = await ask('Write out this recording as text.', { noteId: 'n10', action: 'transcribe', files: [R.memo] });
  assert.equal(result.stop, 'done');
  assert.equal(result.answer, 'Melk en brood halen.');
  assert.deepEqual(result.usage, { input: 0, output: 0, seconds: 7 });
  assert.equal(result.model, 'gpt-transcribe');
  assert.equal(result.first, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/audio/transcriptions');
  assert.ok(calls[0].body instanceof Uint8Array);
  const text = Buffer.from(calls[0].body).toString('latin1');
  assert.match(text, /name="model"\r\n\r\ngpt-transcribe/);
  assert.match(text, /name="languages\[\]"\r\n\r\nnl\r\n/, 'the language of Joplin as a hint');
  assert.ok(text.includes(Buffer.from(joplin.resources.get(R.memo).bytes).toString('latin1')));
  assert.ok(!text.includes('Boodschappen') && !text.includes('<note'), 'no notes go along');
  assert.match(calls[0].headers['Content-Type'], /^multipart\/form-data; boundary=/);
  // A file action takes only its own kind of file, and one file.
  assert.match((await ask('Write out this recording as text.', { noteId: 'n10', action: 'transcribe', files: [R.photo] })).error, /no longer in this note/);
  assert.match((await ask('Write out this recording as text.', { noteId: 'n10', action: 'transcribe', files: [] })).error, /Choose a file first/);
});

test('read photo: the photo with the fixed request, no tools and no notes', async () => {
  await on();
  service = () => ({ content: 'Melk\nBrood' });
  const result = await ask('Write out the text on this photo.', { noteId: 'n10', action: 'photo', files: [R.photo] });
  assert.equal(result.answer, 'Melk\nBrood');
  assert.equal(calls.length, 1);
  const body = calls[0].body;
  assert.equal(body.tools, undefined, 'no tools');
  assert.match(body.messages[0].content, /You read a photo for the JotDrop notes app/);
  assert.equal(body.messages.length, 2);
  const parts = body.messages[1].content;
  assert.deepEqual(parts.map((part) => part.type), ['image_url', 'text']);
  assert.match(parts[1].text, /Write out the text on this photo, handwriting too/);
  assert.ok(!JSON.stringify(body).includes('<note'));
  assert.equal(await answer({ type: 'aiAddBelow', id: 'n10', text: result.answer }), true);
  assert.match(joplin.notes.get('n10').body, /\n\nMelk\nBrood\n$/);
});

test('receipt: checked fields, Apply writes title, lines and drawer; a bad date or a changed note changes nothing', async () => {
  await on();
  joplin.tags.set('tag9', { id: 'tag9', title: 'paper drawer/work' });
  const shown = await answer({ type: 'aiFiles', noteId: 'n10', action: 'receipt' });
  assert.deepEqual(shown.drawers, ['work', 'Personal', 'Home']);
  assert.equal(shown.drawer, '');
  service = () => ({ content: 'Hier is het:\n```json\n{"title":"Wasmachine","shop":"MediaMarkt","amount":"499,00","currency":"eur","bought":"2026-11-01","delete":"n1","warrantyUntil":"morgen"}\n```' });
  const result = await ask('Read this receipt.', { noteId: 'n10', action: 'receipt', files: [R.pdf] });
  assert.equal(result.stop, 'done');
  assert.deepEqual(result.receipt, { title: 'Wasmachine', shop: 'MediaMarkt', amount: '499,00', currency: 'EUR', bought: '2026-11-01' });
  assert.equal(calls[0].body.tools, undefined, 'no tools for a receipt');
  assert.match(calls[0].body.messages[1].content.at(-1).text, /title \(a short name for what was bought, in Dutch\)/);
  assert.equal(result.updated, joplin.notes.get('n10').updated_time);
  const before = joplin.notes.get('n10').body;
  assert.match((await answer({ type: 'aiReceipt', id: 'n10', updated: result.updated, title: 'X', lines: 'Y', expires: 'soon', drawer: '' })).error, /Choose how long to keep it/);
  assert.equal(joplin.notes.get('n10').body, before, 'a bad date changes nothing');
  assert.deepEqual(await answer({ type: 'aiReceipt', id: 'n10', updated: result.updated, title: 'Wasmachine', lines: 'Shop: MediaMarkt\nAmount: 499,00 EUR', expires: '2028-11-01', drawer: 'work' }), { expires: '2028-11-01' });
  assert.equal(joplin.notes.get('n10').title, 'Wasmachine');
  assert.equal(joplin.notes.get('n10').body, `${before}\nShop: MediaMarkt\nAmount: 499,00 EUR\n`);
  assert.deepEqual(helperCalls.at(-1), ['setPaper', 'n10', 'paper drawer/work', '2028-11-01', '1w']);
  // The same answer again, now that the note changed: left alone.
  assert.match((await answer({ type: 'aiReceipt', id: 'n10', updated: result.updated, title: 'Z', lines: '', expires: '2028-11-01', drawer: '' })).error, /changed while Ask JotDrop worked/);
  assert.equal(joplin.notes.get('n10').title, 'Wasmachine');
  // An answer without a usable receipt stays plain text.
  service = () => ({ content: 'Ik zie geen bon.' });
  assert.equal((await ask('Read this receipt.', { noteId: 'n10', action: 'receipt', files: [R.photo] })).receipt, null);
});

test('on Joplin for Android no file goes: Joplin cannot read the bytes for a plugin there, and the window says so', async () => {
  try {
    joplin.platform = 'mobile';
    await ai.registerAiSettings();
    await on();
    assert.deepEqual(await ai.aiFileKinds(joplin.notes.get('n10').body), [], 'no file actions in the card menu');
    const { files } = await answer({ type: 'aiFiles', noteId: 'n10' });
    assert.equal(files.length, 5);
    assert.ok(files.every((file) => file.problem === 'Joplin for Android does not let JotDrop read attached files. Use Joplin on your computer for this.'));
    assert.match((await ask('lees dit', { noteId: 'n10', files: [R.photo] })).error, /Joplin for Android does not let JotDrop read attached files/);
    assert.equal(calls.length, 0);
    assert.ok(!helperCalls.some(([name]) => name === 'resourceBytes'));
  } finally {
    joplin.platform = undefined;
    await ai.registerAiSettings();
  }
});

test('source rules: no innerHTML, the key stays in the main process, one fetch', () => {
  const code = (path) => readFileSync(new URL(path, root), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  const page = code('src/board/ask.js') + code('src/board/board.js');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(page));
  assert.ok(!/aiKey|fetch\(/.test(page));
  const main = code('src/ai.ts');
  assert.equal((main.match(/\bfetch\(/g) || []).length, 1);
  assert.match(main, /secure: true/);
  assert.match(main, /public: false, secure: true/);
  const readme = readFileSync(new URL('README.md', root), 'utf8');
  assert.match(readme, /## Ask JotDrop: AI with your own key/);
  assert.match(readme, /Without JotDrop Cloud and Ask JotDrop the plugin makes no network requests/);
  assert.ok(!/—/.test(readme + page + main), 'no em-dashes in public text');
});
