import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baseline, createdTime, followMoves, isCloudNote, linkAttachments, stableId, titleAndBody, wantedTags } from '../src/cloudNote.mjs';
import { noteSummary } from '../src/cloud-shared/note.mjs';

const convert = (text) => titleAndBody(noteSummary(text, 'notes/a.md'));

test('a heading becomes the title and leaves the text', () => {
  assert.deepEqual(convert('# Plans\n\nTake the train'), { title: 'Plans', body: 'Take the train' });
});

test('a plain first line becomes the title and is not repeated', () => {
  assert.deepEqual(convert('Call the plumber\nBefore noon'), { title: 'Call the plumber', body: 'Before noon' });
});

test('frontmatter is not part of the note', () => {
  assert.deepEqual(convert('---\ncolor: red\n---\nShort note'), { title: 'Short note', body: '' });
});

test('a checklist gets its first item as title and keeps every item', () => {
  assert.deepEqual(convert('- [ ] Milk\n- [x] Eggs'), { title: 'Milk', body: '- [ ] Milk\n- [x] Eggs' });
});

test('a link stays in the text, so it still works on the card', () => {
  const url = 'https://example.com/a';
  assert.deepEqual(convert(`${url}\nGood read`), { title: url, body: `${url}\nGood read` });
});

test('a long first line is cut for the title and stays whole in the text', () => {
  const line = 'word '.repeat(30).trim();
  const { title, body } = convert(line);
  assert.equal(title.length, 80);
  assert.equal(body, line);
});

test('a note with only a photo or a recording is named after its time', () => {
  assert.deepEqual(titleAndBody(noteSummary('![[a.m4a]]', 'notes/2026-10-30 174825.md')), { title: '2026-10-30 17:48', body: '![[a.m4a]]' });
  assert.deepEqual(titleAndBody(noteSummary('![[a.m4a]]', 'notes/Memo.md')), { title: 'Memo', body: '![[a.m4a]]' });
});

test('a note keeps the time in its file name, and a name without one has none', () => {
  const time = new Date(2026, 9, 1, 10, 30, 5).getTime();
  assert.deepEqual(createdTime('notes/2026-10-01 103005 Old idea.md'), { user_created_time: time, user_updated_time: time });
  assert.deepEqual(createdTime('notes/idea.md'), {});
});

test('labels, frontmatter tags and inline hashtags become one lower-case list', () => {
  assert.deepEqual(wantedTags(noteSummary('---\njotdrop_labels: ["Work"]\ntags: [Home, work]\n---\nText #Idea', 'notes/a.md')), ['work', 'home', 'idea']);
});

test('archive, trash, conflict copies and other files are not notes for Joplin', () => {
  assert.ok(isCloudNote('notes/a.md'));
  assert.ok(isCloudNote('notes/Work/a.md'));
  for (const path of ['notes/Archive/a.md', 'notes/Trash/a.md', 'notes/a.cloud-conflict-r2.md', 'notes/a.cloud-recovery-r2.md', 'attachments/a.md', 'notes/a.png']) assert.ok(!isCloudNote(path), path);
});

test('the same note gets the same ID on every computer, a valid Joplin ID, and differs per account', async () => {
  const id = await stableId('vault-1', 'notes/a.md');
  assert.match(id, /^[0-9a-f]{32}$/);
  assert.equal(id, await stableId('vault-1', 'notes/a.md'));
  assert.notEqual(id, await stableId('vault-2', 'notes/a.md'));
  assert.notEqual(id, await stableId('vault-1', 'notes/b.md'));
});

test('"only new notes" keeps out what is there and nothing that is already known or deleted', () => {
  const notes = { 'notes/known.md': { id: 'x', hash: 'k' } };
  baseline([
    { path: 'notes/known.md', hash: 'k2' },
    { path: 'notes/old.md', hash: 'o' },
    { path: 'notes/gone.md', hash: 'g', deleted: true },
    { path: 'notes/Archive/a.md', hash: 'a' },
  ], notes);
  assert.deepEqual(notes, { 'notes/known.md': { id: 'x', hash: 'k' }, 'notes/old.md': { skip: true, hash: 'o' } });
});

test('a note that only moved keeps its Joplin note; one that was kept out stays out', () => {
  const notes = { 'notes/a.md': { id: 'x', hash: 'h1' }, 'notes/b.md': { skip: true, hash: 'h2' } };
  followMoves([
    { path: 'notes/a.md', hash: 'h1', deleted: true },
    { path: 'notes/Work/a.md', hash: 'h1' },
    { path: 'notes/b.md', hash: 'h2', deleted: true },
    { path: 'notes/Work/b.md', hash: 'h2' },
    { path: 'notes/c.md', hash: 'h3' },
  ], notes);
  assert.deepEqual(notes, { 'notes/Work/a.md': { id: 'x', hash: 'h1' }, 'notes/Work/b.md': { skip: true, hash: 'h2' } });
});

test('a note moved to the archive does not take its Joplin note along', () => {
  const notes = { 'notes/a.md': { id: 'x', hash: 'h1' } };
  followMoves([{ path: 'notes/a.md', hash: 'h1', deleted: true }, { path: 'notes/Archive/a.md', hash: 'h1' }], notes);
  assert.deepEqual(notes, { 'notes/a.md': { id: 'x', hash: 'h1' } });
});

test('attachments become Joplin links: an image shows, audio is a link, unknown stays as text', async () => {
  const resources = { 'attachments/p.png': { id: 'aa', mime: 'image/png', title: 'p.png' }, 'attachments/v.m4a': { id: 'bb', mime: 'audio/mp4', title: 'v[1].m4a' } };
  const body = await linkAttachments('![[p.png]]\n![](../attachments/v.m4a)\n![[gone.png]]\n![web](https://a.example/x.png)', 'notes/a.md', Object.keys(resources), async (path) => resources[path]);
  assert.equal(body, '![p.png](:/aa)\n[v1.m4a](:/bb)\n![[gone.png]]\n![web](https://a.example/x.png)');
});

test('a failing attachment stops the note, so it can come in whole later', async () => {
  await assert.rejects(linkAttachments('![[p.png]]', 'notes/a.md', ['attachments/p.png'], async () => { throw new Error('no'); }));
});
