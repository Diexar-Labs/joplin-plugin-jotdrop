// The card helpers in src/board/note.js are copies of JotDrop's website code (cloud/web/note.mjs).
// This check compares each copied function with the current version on JotDrop's main branch,
// so a fix there is not silently missing here.
import { readFileSync } from 'node:fs';

const SHARED = ['plainPreviewText', 'stripInlineMarks', 'noteUrls', 'urlKey', 'urlHost'];
const UPSTREAM = 'https://raw.githubusercontent.com/Diexar-Labs/jotdrop/main/cloud/web/note.mjs';

function functionSource(code, name) {
  const start = code.search(new RegExp(`^(?:export )?function ${name}\\(`, 'm'));
  if (start < 0) return null;
  const end = code.indexOf('\n}\n', start);
  return code.slice(start, end + 2).replace(/^export /, '').trim();
}

const local = readFileSync(new URL('../src/board/note.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const response = await fetch(UPSTREAM);
if (!response.ok) throw new Error(`Could not fetch ${UPSTREAM}: ${response.status}`);
const upstream = await response.text();

let differs = 0;
for (const name of SHARED) {
  const mine = functionSource(local, name);
  const theirs = functionSource(upstream, name);
  const same = mine !== null && mine === theirs;
  if (!same) differs++;
  console.log(`${same ? 'same   ' : 'DIFFERS'} ${name}${theirs === null ? ' (not found upstream)' : ''}`);
}
if (differs) {
  console.error(`\n${differs} shared function(s) differ from JotDrop main. Copy the new version into src/board/note.js.`);
  process.exit(1);
}

// src/cloud-shared/ holds whole copies of JotDrop's cloud code: they must match JotDrop main to the byte.
const CLOUD_FILES = { 'client.mjs': 'cloud/shared/client.mjs', 'crypto.mjs': 'cloud/shared/crypto.mjs', 'merge.mjs': 'cloud/shared/merge.mjs', 'sync.mjs': 'cloud/shared/sync.mjs', 'note.mjs': 'cloud/web/note.mjs', 'drawing.mjs': 'cloud/shared/drawing.mjs', 'drawing-editor.mjs': 'cloud/shared/drawing-editor.mjs', 'paper.mjs': 'cloud/shared/paper.mjs', 'expiry.mjs': 'cloud/shared/expiry.mjs', 'links.mjs': 'cloud/shared/links.mjs', 'list-links.mjs': 'cloud/shared/list-links.mjs', 'diff.mjs': 'cloud/shared/diff.mjs', 'ai-web.mjs': 'cloud/web/ai-web.mjs', 'filekinds.json': 'cloud/shared/filekinds.json' };
// Ask JotDrop's shared core (cloud/shared/ai), in src/cloud-shared/ai/.
for (const name of ['assistant', 'providers', 'tools', 'prompt', 'context', 'redact', 'markdown', 'parts']) CLOUD_FILES[`ai/${name}.mjs`] = `cloud/shared/ai/${name}.mjs`;
// Here the copies sit in one folder, so the web app's ai-web.mjs reaches '../shared/x' as './x'. Nothing else may differ.
const asHere = (path, text) => (path === 'cloud/web/ai-web.mjs' ? text.replace(/from '\.\.\/shared\//g, "from './") : text);
let stale = 0;
for (const [file, path] of Object.entries(CLOUD_FILES)) {
  const url = `https://raw.githubusercontent.com/Diexar-Labs/jotdrop/main/${path}`;
  const answer = await fetch(url);
  if (!answer.ok) throw new Error(`Could not fetch ${url}: ${answer.status}`);
  const same = asHere(path,(await answer.text()).replace(/\r\n/g, '\n')) === readFileSync(new URL(`../src/cloud-shared/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  if (!same) stale++;
  console.log(`${same ? 'same   ' : 'DIFFERS'} cloud-shared/${file}`);
}
if (stale) {
  console.error(`\n${stale} copied cloud file(s) differ from JotDrop main. Copy the new version into src/cloud-shared/.`);
  process.exit(1);
}
