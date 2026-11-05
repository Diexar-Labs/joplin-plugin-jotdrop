import { syncList } from './cloud-shared/list-links.mjs';

// Sharing a Joplin note by link. No Joplin API in here, so it can be tested on its own.
// The other apps tie a list link to a note in JotDrop Cloud. Joplin notes do not go to the cloud, so here the link
// belongs to the Joplin note itself: its path is "joplin:<note id>" and its version number is the note's updated_time.
// The other apps find no note with such a path and leave the link alone.

const PREFIX = 'joplin:';
// A list link holds about this much text; the sealed list and its marks must stay under the server's 64 KB.
export const LIST_TEXT_BYTES = 48 * 1024;

export const joplinPath = (id) => `${PREFIX}${id}`;
/** The Joplin note ID of a link made here, or null for a link of another app. */
export const noteIdOf = (path) => (typeof path === 'string' && /^joplin:[0-9a-f]{32}$/.test(path) ? path.slice(PREFIX.length) : null);

const RESOURCE_IMAGE = /^\s*!\[[^\]]*\]\([^)]*\)\s*$|^\s*<img\b[^>]*>\s*$/i;
const RESOURCE_LINK = /\[([^\]]*)\]\(:\/[0-9a-fA-F]{32}[^)]*\)/g;

/** A copy link's text: the body without embedded images, and an attachment link becomes its name, as Joplin's files stay behind. */
export function copyText(body) {
	return String(body || '').replace(/\r\n?/g, '\n').split('\n').filter((line) => !RESOURCE_IMAGE.test(line)).join('\n').replace(RESOURCE_LINK, '$1');
}

export function tooLarge(text) {
	return new TextEncoder().encode(String(text).replace(/\r\n?/g, '\n')).length > LIST_TEXT_BYTES;
}

/**
 * One check of one list link made in Joplin. `getNote(id)` gives `{ title, body, updated_time, deleted_time }` or null,
 * `writeNote(id, body, updatedTime)` writes the body only when the note still has that updated_time (false otherwise),
 * `endLink(id)` ends the link. Returns what happened: 'other' (not a Joplin link, or no key on this device), 'missing',
 * 'ended' (the note is in the trash), 'skipped' (an older note than the link's base), 'note' (guests' changes went
 * into the note), 'link' (your changes went to the link), 'busy' (the note changed during the check) or 'quiet'.
 */
export async function checkLink(client, link, { getNote, writeNote, endLink, ownerName = 'Owner', now, ...options }) {
	const id = noteIdOf(link.path);
	if (!id || !link.key) return 'other';
	const note = await getNote(id);
	if (!note) return 'missing';
	if (note.deleted_time) { await endLink(link.id); return 'ended'; }
	const result = await syncList(client, link, { note: String(note.body || ''), noteRevision: Number(note.updated_time), title: String(note.title || ''), ownerName, now, ...options });
	if (result.skipped) return 'skipped';
	if (result.noteChanged) return (await writeNote(id, result.text, Number(note.updated_time))) ? 'note' : 'busy';
	return result.linkChanged ? 'link' : 'quiet';
}

/** The last five ticks and additions with a name, newest first, from an opened list. */
export function lastMarks(lines) {
	return lines.filter((line) => line.task && line.mark && (line.ticked || line.mark.added)).sort((a, b) => b.mark.at - a.mark.at).slice(0, 5)
		.map((line) => ({ by: line.mark.by, at: line.mark.at, added: line.mark.added && !line.ticked, text: line.text }));
}
