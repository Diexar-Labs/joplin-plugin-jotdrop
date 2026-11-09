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

test('compact cards cap tasks without changing their source lines or the note', () => {
  const body = ['Some text above', ...Array.from({ length: 100 }, (_, i) => `- [ ] task ${i + 1}`)].join('\n');
  const lines = previewLines(body, 'List');
  assert.equal(lines.filter((line) => line.line !== undefined).length, 5);
  assert.equal(lines.at(-1).line, 5);
  const expanded = previewLines(body, 'List', Infinity, 10);
  assert.equal(expanded.filter((line) => line.line !== undefined).length, 10);
  assert.equal(expanded.at(-1).line, 10);
  assert.equal(previewLines(body, 'List', Infinity, Infinity).filter((line) => line.line !== undefined).length, 100);
  assert.equal(body.split('\n').length, 101);
  assert.equal(previewLines(Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n'), 'Plain').length, 12);
});

test('YAML, quoted tasks and fenced code never become clickable preview tasks', () => {
  const body = '---\n- [ ] yaml\n---\n# Title\n```\n- [ ] code\n```\n> - [ ] quoted\n- [ ] real';
  const tasks = previewLines(body, 'Title', Infinity, Infinity).filter(line => line.line !== undefined);
  assert.deepEqual(tasks, [{line: 8, checked: false, text: 'real'}]);
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
