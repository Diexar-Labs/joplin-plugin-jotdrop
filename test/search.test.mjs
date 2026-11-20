import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAdvancedSearch } from '../src/board/search.js';

test("Joplin's search language goes to Joplin: fields, phrases and exclusions", () => {
  for (const text of ['title:tax', 'body:invoice 2026', 'iscompleted:0', 'type:todo', 'tag:work -tag:old', '"exact phrase"', 'budget -draft', '-draft', 'any:1 apple pear', 'Notebook:Home']) {
    assert.equal(isAdvancedSearch(text), true, text);
  }
});

test('plain words, dashes inside a word and colons in prose stay plain', () => {
  for (const text of ['', '   ', 'tax', 'tax return', 'well-known', 'a - b', 'e-mail', '12:30', 'note: call', 'hello:', 'size 5-10']) {
    assert.equal(isAdvancedSearch(text), false, text);
  }
});
