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
const CLOUD_FILES = { 'client.mjs': 'cloud/shared/client.mjs', 'crypto.mjs': 'cloud/shared/crypto.mjs', 'merge.mjs': 'cloud/shared/merge.mjs', 'sync.mjs': 'cloud/shared/sync.mjs', 'note.mjs': 'cloud/web/note.mjs' };
let stale = 0;
for (const [file, path] of Object.entries(CLOUD_FILES)) {
  const url = `https://raw.githubusercontent.com/Diexar-Labs/jotdrop/main/${path}`;
  const answer = await fetch(url);
  if (!answer.ok) throw new Error(`Could not fetch ${url}: ${answer.status}`);
  const same = (await answer.text()).replace(/\r\n/g, '\n') === readFileSync(new URL(`../src/cloud-shared/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  if (!same) stale++;
  console.log(`${same ? 'same   ' : 'DIFFERS'} cloud-shared/${file}`);
}
if (stale) {
  console.error(`\n${stale} copied cloud file(s) differ from JotDrop main. Copy the new version into src/cloud-shared/.`);
  process.exit(1);
}
