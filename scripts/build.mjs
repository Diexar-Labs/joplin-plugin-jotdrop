// Builds dist/ (what Joplin loads) and publish/net.jotdrop.joplin.jpl (a tar of dist/, like generator-joplin makes).
import { build } from 'esbuild';
import { create } from 'tar';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const publish = join(root, 'publish');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
mkdirSync(publish, { recursive: true });

await build({
	entryPoints: [join(root, 'src/index.ts')],
	outfile: join(dist, 'index.js'),
	bundle: true,
	format: 'iife',
	platform: 'browser',
	target: 'es2020',
	alias: { api: join(root, 'api') },
});

for (const name of ['board', 'launcher']) {
	await build({
		entryPoints: [join(root, `src/board/${name}.js`)],
		outfile: join(dist, `${name}.js`),
		bundle: true,
		format: 'iife',
		platform: 'browser',
		target: 'es2020',
	});
}

// Mobile can inline CSS as text, which breaks relative font URLs, so the fonts travel inside the CSS.
let css = readFileSync(join(root, 'src/board/board.css'), 'utf8');
css = css.replace(/url\("fonts\/([\w-]+\.woff2)"\)/g, (_m, file) =>
	`url("data:font/woff2;base64,${readFileSync(join(root, 'src/fonts', file)).toString('base64')}")`);
writeFileSync(join(dist, 'board.css'), css);
cpSync(join(root, 'src/board/launcher.css'), join(dist, 'launcher.css'));
cpSync(join(root, 'src/manifest.json'), join(dist, 'manifest.json'));
cpSync(join(root, 'src/fonts/OFL.txt'), join(dist, 'OFL.txt'));

const manifest = JSON.parse(readFileSync(join(root, 'src/manifest.json'), 'utf8'));
const jpl = join(publish, `${manifest.id}.jpl`);
rmSync(jpl, { force: true });
await create({ strict: true, portable: true, file: jpl, cwd: dist }, readdirSync(dist));

// Joplin's plugin repository reads this file next to the .jpl (same fields as generator-joplin writes).
const git = (args) => execSync(`git ${args}`, { cwd: root, encoding: 'utf8' }).trim();
writeFileSync(join(publish, `${manifest.id}.json`), JSON.stringify({
	...manifest,
	_publish_hash: `sha256:${createHash('sha256').update(readFileSync(jpl)).digest('hex')}`,
	_publish_commit: `${git('rev-parse --abbrev-ref HEAD')}:${git('rev-parse HEAD')}`,
}, null, '	'));
console.log(`Built ${jpl}`);
