import assert from 'node:assert/strict';
import { test } from 'node:test';
import { previewLines } from '../src/board/note.js';

const texts = (lines) => lines.map((line) => line.text);

test('a first heading that repeats the title is not shown twice', () => {
  assert.deepEqual(texts(previewLines('# Welcome to Joplin!\n\nJoplin is free.', '1. Welcome to Joplin!')), ['Joplin is free.']);
});

test('a first heading that is not the title stays', () => {
  assert.deepEqual(texts(previewLines('## Ingrediënten\n- bloem', 'Pannenkoeken')), ['Ingrediënten', '• bloem']);
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
  assert.deepEqual(tasks, [{line: 8, checked: false, text: 'real', level: 0}]);
});

test('checklist lines keep the index of their line in the note', () => {
  const tasks = previewLines('Intro\n\n- [x] A\n- [ ] B', 'T').filter((line) => line.line !== undefined);
  assert.deepEqual(tasks.map((line) => [line.line, line.checked, line.text]), [[2, true, 'A'], [3, false, 'B']]);
});

test('lists in levels: bullets show as •, numbers keep their number, the card shows 3 levels', () => {
  const body = 'Intro\n- [ ] top\n\t- [x] sub\n\t\t- [ ] deep\n\t\t\t- [ ] deeper\n* bullet\n    2) second\n> - quoted';
  const lines = previewLines(body, 'T', Infinity, Infinity);
  assert.deepEqual(lines.map((line) => [line.text, line.level, line.line]), [
    ['Intro', undefined, undefined], ['top', 0, 1], ['sub', 1, 2], ['deep', 2, 3], ['deeper', 2, 4], ['• bullet', 0, undefined], ['2) second', 1, undefined], ['- quoted', undefined, undefined],
  ]);
});

test('image-only lines are left out of the text', () => {
  assert.deepEqual(texts(previewLines('![](:/0123456789abcdef0123456789abcdef)\nFoto', 'x')), ['Foto']);
});

test('a checklist inside a code block is not a checklist', () => {
  assert.deepEqual(previewLines('```\n- [ ] not a task\n```', 'x'), [{ text: '- [ ] not a task' }]);
});

test('a checklist saved with Windows line endings (CRLF) still shows its tasks, on the same source lines', () => {
  const body = ['- [ ] Een', '- [x] Twee', '- [ ] Drie'].join('\r\n');
  const lines = previewLines(body, 'List');
  assert.deepEqual(lines, [
    { line: 0, checked: false, text: 'Een', level: 0 },
    { line: 1, checked: true, text: 'Twee', level: 0 },
    { line: 2, checked: false, text: 'Drie', level: 0 },
  ]);
  assert.deepEqual(texts(previewLines('Eerste\r\n\r\nTweede\r\n', 'T')), ['Eerste', '', 'Tweede']);
});

test('a table is one card row with its cells, never a checklist line', () => {
  const body = 'Prices\n\n| Item | **Price** | Shop | Day |\n|:--|--:|---|---|\n| Tea | 3 | [Bar](https://x.example) | Mon |\n| Milk \\| oat | 2 |\n\n- [ ] pay';
  const lines = previewLines(body, 'Shopping', Infinity, Infinity);
  const table = lines.find((line) => line.table);
  assert.deepEqual(table.table.header, ['Item', '**Price**', 'Shop', 'Day']);
  assert.deepEqual(table.table.align, ['left', 'right', '', '']);
  assert.equal(table.table.rows.length, 2);
  assert.equal(table.text, 'Item · Price · Shop · Day\nTea · 3 · Bar · Mon\nMilk | oat · 2');
  assert.equal(table.line, undefined);
  assert.deepEqual(lines.map((line) => (line.table ? 'table' : line.text)), ['Prices', '', 'table', '', 'pay']);
});

test('a table in a code block stays code', () => {
  const lines = previewLines('```\n| a | b |\n|---|---|\n```', '', Infinity, Infinity);
  assert.equal(lines.some((line) => line.table), false);
});

test('&nbsp; is a space, not text: an empty paragraph is a blank line and a note of only &nbsp; has no text', () => {
  assert.deepEqual(previewLines('&nbsp;', 'Dessin à main levée.svg'), []);
  assert.deepEqual(previewLines('![drawing](:/0123456789abcdef0123456789abcdef)\n\n&nbsp;', 'Dessin'), []);
  assert.deepEqual(texts(previewLines('Eerste\n&nbsp;\n&nbsp;\nTweede', 'T')), ['Eerste', '', 'Tweede']);
  assert.deepEqual(texts(previewLines('a&nbsp;b &nbsp; c', 'T')), ['a b   c']);
});

test('&nbsp; stays as typed inside inline code and fenced code, as Markdown shows it', () => {
  assert.deepEqual(texts(previewLines('Use `&nbsp;` for a space, not&nbsp;this', 'T')), ['Use &nbsp; for a space, not this']);
  assert.deepEqual(texts(previewLines('```html\n<p>&nbsp;</p>\n```\n&nbsp;', 'T')), ['<p>&nbsp;</p>']);
});

test('&nbsp; in a task or a bullet changes no line index', () => {
  const tasks = previewLines('&nbsp;\n- [ ] milk&nbsp;&nbsp;2\n- bullet&nbsp;x\n- [x] done', 'T', Infinity, Infinity);
  assert.deepEqual(tasks.filter((line) => line.line !== undefined).map((line) => [line.line, line.checked, line.text]), [[1, false, 'milk  2'], [3, true, 'done']]);
  assert.ok(tasks.some((line) => line.text === '• bullet x'));
});

test('&nbsp; in a table cell is a space, and an empty cell stays empty', () => {
  const table = previewLines('| a | b&nbsp;c |\n|---|---|\n| 1 | &nbsp; |', 'T').find((line) => line.table);
  assert.deepEqual(table.table.header, ['a', 'b c']);
  assert.deepEqual(table.table.rows, [['1', '']]);
});
