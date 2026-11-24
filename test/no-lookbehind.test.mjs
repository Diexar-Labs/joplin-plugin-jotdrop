import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Safari before iOS 16.4 cannot load a script with a lookbehind in a regular expression, and then nothing in it runs.
// Joplin's mobile app runs plugins in a web view, so no script of the plugin may have one.
const root = fileURLToPath(new URL('..', import.meta.url));
const LOOKBEHIND = /\(\?<[!=]/;

const scripts = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return scripts(path);
  return /\.(?:ts|mjs|js)$/.test(entry.name) ? [relative(root, path).replace(/\\/g, '/')] : [];
});
const withLookbehind = (files) => files.filter((file) => LOOKBEHIND.test(readFileSync(join(root, file), 'utf8')));

test('no script in src/ has a lookbehind', () => {
  const files = scripts(join(root, 'src'));
  // The walk reaches the files it is meant for, so an empty walk cannot pass.
  for (const file of ['src/index.ts', 'src/fileChips.mjs', 'src/board/board.js', 'src/cloud-shared/expiry.mjs', 'src/cloud-shared/note.mjs', 'src/cloud-shared/ai/redact.mjs']) assert.ok(files.includes(file), file);
  assert.deepEqual(withLookbehind(files), []);
});

// dist/ is what the .jpl holds; it is there after `npm run build`.
test('no script in the build has a lookbehind', { skip: !existsSync(join(root, 'dist/index.js')) && 'no build yet' }, () => {
  const files = scripts(join(root, 'dist'));
  for (const file of ['dist/index.js', 'dist/board.js', 'dist/launcher.js']) assert.ok(files.includes(file), file);
  assert.deepEqual(withLookbehind(files), []);
});
