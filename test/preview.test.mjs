import assert from 'node:assert/strict';
import { test } from 'node:test';
import { previewLines } from '../src/board/note.js';

const texts = (lines) => lines.map((line) => line.text);

test('a first heading that repeats the title is not shown twice', () => {
  assert.deepEqual(texts(previewLines('# Welcome to Joplin!\n\nJoplin is free.', '1. Welcome to Joplin!')), ['Joplin is free.']);
});

test('a first heading that is not the title stays', () => {
  assert.deepEqual(texts(previewLines('## Ingrediënten\n- bloem', 'Pannenkoeken')), ['Ingrediënten', '- bloem']);
});

test('checklist lines keep the index of their line in the note', () => {
  const tasks = previewLines('Intro\n\n- [x] A\n- [ ] B', 'T').filter((line) => line.line !== undefined);
  assert.deepEqual(tasks.map((line) => [line.line, line.checked, line.text]), [[2, true, 'A'], [3, false, 'B']]);
});

test('image-only lines are left out of the text', () => {
  assert.deepEqual(texts(previewLines('![](:/0123456789abcdef0123456789abcdef)\nFoto', 'x')), ['Foto']);
});

test('a checklist inside a code block is not a checklist', () => {
  assert.deepEqual(previewLines('```\n- [ ] not a task\n```', 'x'), [{ text: '- [ ] not a task' }]);
});
