import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileChip, fileKind, resourceLinks, sizeText } from '../src/fileChips.mjs';
import { previewLines } from '../src/board/note.js';

const ID = '0123456789abcdef0123456789abcdef';

test('file kinds come from the shared list', () => {
  assert.equal(fileKind('Offer.PDF'), 'pdf');
  assert.equal(fileKind('clip.mov'), 'video');
  assert.equal(fileKind('scan.bmp'), 'image');
  assert.equal(fileKind('memo.flac'), 'audio');
  assert.equal(fileKind('budget.xlsx'), 'file');
  assert.equal(fileKind('README'), 'file');
});

test('resource links are found with or without !, note links too (their lookup sorts them out)', () => {
  const body = `See [offer.pdf](:/${ID}) and ![scan](:/${'a'.repeat(32)} "title") and [a note](:/${'B'.repeat(32)}).`;
  assert.deepEqual(resourceLinks(body).map((l) => [l.id, l.text]), [[ID, 'offer.pdf'], ['a'.repeat(32), 'scan'], ['b'.repeat(32), 'a note']]);
  assert.deepEqual(resourceLinks('[web](https://example.com) and ![[x.pdf]]'), []);
});

test('a photo or a sound is no chip; anything else is, with name and size', () => {
  assert.equal(fileChip({ id: ID, title: 'p.jpg', mime: 'image/jpeg', file_extension: 'jpg', size: 9 }), null);
  assert.equal(fileChip({ id: ID, title: 'memo.m4a', mime: 'audio/mp4', file_extension: 'm4a', size: 9 }), null);
  assert.equal(fileChip({ id: ID, title: 'odd.heic', mime: 'image/heic', file_extension: 'heic', size: 9 }), null);
  assert.deepEqual(fileChip({ id: ID, title: 'Offer.pdf', mime: 'application/pdf', file_extension: 'pdf', size: 2048 }), { id: ID, name: 'Offer.pdf', kind: 'pdf', size: 2048 });
  assert.deepEqual(fileChip({ id: ID, title: '', mime: 'application/zip', file_extension: 'zip', size: -1 }, 'backup'), { id: ID, name: 'backup', kind: 'file', size: 0 });
  assert.equal(fileChip({ id: ID, title: 'film.mp4', mime: 'video/mp4', file_extension: 'mp4', size: 5 }).kind, 'video');
});

test('sizes read like the website', () => {
  assert.equal(sizeText(10), '1 KiB');
  assert.equal(sizeText(2048), '2 KiB');
  assert.equal(sizeText(3 * 1048576 + 1), '3.0 MiB');
});

test('a file link Joplin made shows no text once removed, the rest of the line stays', () => {
  const link = `[offer.pdf](:/${ID})`;
  const body = `Quote for the roof\n\n${link}\n\nSee ${link} for prices`;
  const shown = body.split(link).join('');
  assert.deepEqual(previewLines(shown, 'Roof').map((l) => l.text), ['Quote for the roof', '', 'See  for prices']);
});
