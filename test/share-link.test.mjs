import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateVaultKey } from '../src/cloud-shared/crypto.mjs';
import { addItem, createListLink, listListLinks, openList, tickItem } from '../src/cloud-shared/list-links.mjs';
import { checkLink, copyText, joplinPath, lastMarks, noteIdOf, tooLarge } from '../src/shareLink.mjs';

const URL = 'https://cloud.test';
const NOTE_ID = '0123456789abcdef0123456789abcdef';

// The list-link routes of the server, in memory: one sealed version with a number, swapped only when the writer names it.
function fakeCloud() {
	const links = new Map();
	const credentials = { url: URL, vaultId: 'vault-1', vaultKey: generateVaultKey() };
	const conflict = () => Object.assign(new Error('Changed in the meantime.'), { status: 409 });
	const client = {
		credentials,
		async call(path, method = 'GET', body) {
			if (path === '/list-links' && method === 'POST') {
				links.set(body.id, { id: body.id, revision: 1, envelope: body.envelope, ownerEnvelope: body.ownerEnvelope, updatedAt: new Date().toISOString(), expiresAt: null });
				return { expiresAt: null };
			}
			if (path === '/list-links') return { links: [...links.values()].map(({ envelope, ...link }) => link) };
			const id = path.split('/').pop(), link = links.get(id);
			if (method === 'DELETE') { links.delete(id); return {}; }
			if (link.revision !== body.baseRevision) throw conflict();
			if (body.envelope) { link.envelope = body.envelope; link.revision++; }
			link.ownerEnvelope = body.ownerEnvelope;
			return { revision: link.revision };
		},
	};
	const fetcher = async (address, init = {}) => {
		const id = address.split('/').pop(), link = links.get(id);
		const answer = (status, value) => ({ ok: status < 300, status, json: async () => value });
		if (!link) return answer(404, { error: 'This link has ended.' });
		if (!init.method || init.method === 'GET') return answer(200, { envelope: link.envelope, revision: link.revision, expiresAt: null });
		const body = JSON.parse(init.body);
		if (body.baseRevision !== link.revision) return answer(409, { error: 'Changed.', currentRevision: link.revision });
		link.envelope = body.envelope;
		link.revision++;
		return answer(200, { revision: link.revision });
	};
	return { client, fetcher, links };
}

// A Joplin note with updated_time, and a writer that only writes when it has not changed in the meantime.
function fakeNote(body) {
	const note = { title: 'Groceries', body, updated_time: 1000, deleted_time: 0 };
	let clock = 1000;
	return {
		note,
		edit(next) { note.body = next; note.updated_time = ++clock; },
		deps: {
			getNote: async (id) => (id === NOTE_ID ? { ...note } : null),
			writeNote: async (id, next, updatedTime) => {
				if (note.updated_time !== updatedTime) return false;
				note.body = next;
				note.updated_time = ++clock;
				return true;
			},
			ended: [],
		},
	};
}

async function setup(body = '- [ ] milk\n- [ ] bread') {
	const cloud = fakeCloud();
	const joplin = fakeNote(body);
	const deps = { ...joplin.deps, fetcher: cloud.fetcher, endLink: async (id) => { joplin.deps.ended.push(id); cloud.links.delete(id); } };
	const made = await createListLink(cloud.client, { title: 'Groceries', text: body }, { origin: URL, path: joplinPath(NOTE_ID), noteRevision: joplin.note.updated_time });
	const link = async () => (await listListLinks(cloud.client)).find((item) => item.id === made.id);
	return { cloud, joplin, deps, made, link };
}

test('a copy link leaves Joplin attachments behind', () => {
	assert.equal(copyText('Shopping\n![photo](:/0123456789abcdef0123456789abcdef)\n<img src=":/0123456789abcdef0123456789abcdef">\nSee [the receipt.pdf](:/0123456789abcdef0123456789abcdef) and [site](https://x.test)'),
		'Shopping\nSee the receipt.pdf and [site](https://x.test)');
	assert.equal(copyText('a\r\nb'), 'a\nb');
});

test('only links made in Joplin belong to a Joplin note', () => {
	assert.equal(noteIdOf(joplinPath(NOTE_ID)), NOTE_ID);
	assert.equal(noteIdOf('notes/Groceries.md'), null);
	assert.equal(noteIdOf('joplin:../x'), null);
	assert.equal(noteIdOf(null), null);
	assert.equal(tooLarge('x'.repeat(48 * 1024)), false);
	assert.equal(tooLarge('x'.repeat(48 * 1024 + 1)), true);
});

test('a guest tick comes into the note, and the next check makes the note the base', async () => {
	const { cloud, joplin, deps, made, link } = await setup();
	assert.equal(await checkLink(cloud.client, await link(), deps), 'quiet');
	const list = await openList(URL, made.id, made.key, { fetcher: cloud.fetcher });
	const ticked = await tickItem(URL, made.id, made.key, list, list.lines[1], true, { name: 'Anna', now: 1000, fetcher: cloud.fetcher });
	await addItem(URL, made.id, made.key, ticked, 'cheese', { name: 'Ben', now: 2000, fetcher: cloud.fetcher });
	assert.equal(await checkLink(cloud.client, await link(), deps), 'note');
	assert.equal(joplin.note.body, '- [ ] milk\n- [x] bread\n- [ ] cheese');
	// The link already holds the same text: only the base moves to the note.
	assert.equal(await checkLink(cloud.client, await link(), deps), 'quiet');
	const moved = await link();
	assert.equal(moved.base.text, joplin.note.body);
	assert.equal(moved.base.revision, moved.revision);
	const marks = lastMarks((await openList(URL, made.id, made.key, { fetcher: cloud.fetcher })).lines);
	assert.deepEqual(marks.map((mark) => [mark.by, mark.text, mark.added]), [['Ben', 'cheese', true], ['Anna', 'bread', false]]);
});

test('what you tick in Joplin goes to the link under "Owner"', async () => {
	const { cloud, joplin, deps, made, link } = await setup();
	joplin.edit('- [x] milk\n- [ ] bread');
	assert.equal(await checkLink(cloud.client, await link(), deps), 'link');
	const list = await openList(URL, made.id, made.key, { fetcher: cloud.fetcher });
	assert.equal(list.text, '- [x] milk\n- [ ] bread');
	assert.equal(list.lines[0].mark.by, 'Owner');
});

test('a note that changed during the check is not written over', async () => {
	const { cloud, joplin, deps, made, link } = await setup();
	const list = await openList(URL, made.id, made.key, { fetcher: cloud.fetcher });
	await tickItem(URL, made.id, made.key, list, list.lines[0], true, { name: 'Anna', fetcher: cloud.fetcher });
	const busy = { ...deps, getNote: async (id) => { const note = await deps.getNote(id); joplin.edit('- [ ] milk\n- [ ] bread\n- [ ] eggs'); return note; } };
	assert.equal(await checkLink(cloud.client, await link(), busy), 'busy');
	assert.equal(joplin.note.body, '- [ ] milk\n- [ ] bread\n- [ ] eggs');
	// The next round takes the guest's tick into the newer note, and keeps the eggs.
	assert.equal(await checkLink(cloud.client, await link(), deps), 'note');
	assert.equal(joplin.note.body, '- [x] milk\n- [ ] bread\n- [ ] eggs');
});

test('a note in the trash ends its link; a missing note or another app\'s link is left alone', async () => {
	const { cloud, joplin, deps, made, link } = await setup();
	const other = { ...(await link()), path: 'notes/Groceries.md' };
	assert.equal(await checkLink(cloud.client, other, deps), 'other');
	assert.equal(await checkLink(cloud.client, { ...(await link()), key: null }, deps), 'other');
	assert.equal(await checkLink(cloud.client, await link(), { ...deps, getNote: async () => null }), 'missing');
	joplin.note.deleted_time = 5000;
	assert.equal(await checkLink(cloud.client, await link(), deps), 'ended');
	assert.deepEqual(deps.ended, [made.id]);
	assert.equal(cloud.links.size, 0);
});

test('a Joplin with an older version of the note waits', async () => {
	const { cloud, joplin, deps, link } = await setup();
	joplin.note.updated_time = 10;
	joplin.note.body = '- [ ] milk';
	assert.equal(await checkLink(cloud.client, await link(), deps), 'skipped');
});
