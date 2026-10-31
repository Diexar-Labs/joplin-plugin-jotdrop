import { attachmentPath, plainPreviewText } from './cloud-shared/note.mjs';
import { isPreserved } from './cloud-shared/sync.mjs';

// How a file from JotDrop Cloud becomes a Joplin note. No Joplin API in here, so it can be tested on its own.

export const isCloudNote = (path) => /^notes\/.*\.md$/i.test(path) && !/^notes\/(archive|trash)\//i.test(path) && !isPreserved(path.split('/').pop());

/** The same note and file get the same Joplin ID on every computer, so two connected Joplins never make two notes. */
export async function stableId(vaultId, name) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`jotdrop:${vaultId}:${name}`));
	return [...new Uint8Array(digest)].slice(0, 16).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const EMBED = /^!\[\[[^\]]*\]\]$|^!\[[^\]]*\]\([^)]*\)$/;
const LIST_MARK = /^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/;

/**
 * The app's notes usually have no heading, so the first line of text is the title. A plain short line moves there;
 * a checklist item, a long line or a link stays in the text as well, or it would stop working on the card.
 */
export function titleAndBody(summary) {
	const heading = /^\s*#\s+(.+)(?:\r?\n|$)/.exec(summary.body);
	if (heading) return { title: plainPreviewText(heading[1]).trim(), body: summary.preview };
	const first = summary.body.split(/\r?\n/).map((line) => line.trim()).find((line) => line && !EMBED.test(line)) || '';
	// Only a photo or a recording: its time is the best name there is. Otherwise a list of voice memos is all "Untitled".
	if (!first) return { title: summary.title.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2})(\d{2})\d{2}.*$/, '$1 $2:$3'), body: summary.body.trim() };
	const plain = plainPreviewText(first.replace(LIST_MARK, '')).trim();
	const moves = plain === first && first.length <= 80 && !plain.includes('://');
	return { title: plain.slice(0, 80), body: (moves ? summary.body.replace(first, '') : summary.body).trim() };
}

/** A note keeps its age: the app's file names start with the time it was made, and the board sorts on it. */
export function createdTime(path) {
	const stamp = /^(\d{4})-(\d{2})-(\d{2}) (\d{2})(\d{2})(\d{2})/.exec(path.split('/').pop());
	if (!stamp) return {};
	const time = new Date(+stamp[1], stamp[2] - 1, +stamp[3], +stamp[4], +stamp[5], +stamp[6]).getTime();
	return Number.isFinite(time) ? { user_created_time: time, user_updated_time: time } : {};
}

/** Joplin writes tags in lower case. */
export const wantedTags = (summary) => [...new Set([...summary.labels, ...summary.tags, ...summary.inlineTags].map((tag) => tag.toLowerCase()))];

/** The notes that are in the cloud when someone connects with "only new notes": they stay out. */
export function baseline(files, notes) {
	for (const file of files) if (!file.deleted && isCloudNote(file.path) && !notes[file.path]) notes[file.path] = { skip: true, hash: file.hash };
}

/** A note that only moved in the cloud (same text, new path) keeps its Joplin note. */
export function followMoves(files, notes) {
	const gone = new Map();
	for (const file of files) if (file.deleted && notes[file.path]) gone.set(notes[file.path].hash, file.path);
	for (const file of files) {
		if (file.deleted || notes[file.path] || !isCloudNote(file.path) || !gone.has(file.hash)) continue;
		notes[file.path] = notes[gone.get(file.hash)];
		delete notes[gone.get(file.hash)];
		gone.delete(file.hash);
	}
}

/** Puts Joplin links in place of `![[...]]` and `![](...)`. A file the cloud does not have keeps its original text. */
export async function linkAttachments(body, notePath, available, resourceFor) {
	let out = '', last = 0;
	for (const match of body.matchAll(/!\[\[([^\]]+)\]\]|!\[[^\]]*\]\(([^)\s]+)\)/g)) {
		const target = match[1] || match[2];
		const found = /^[a-z]+:/i.test(target) ? undefined : attachmentPath(target, notePath, available);
		out += body.slice(last, match.index);
		last = match.index + match[0].length;
		if (!found) { out += match[0]; continue; }
		const { id, mime, title } = await resourceFor(found);
		const shown = String(title).replace(/[[\]]/g, '');
		out += String(mime).startsWith('image/') ? `![${shown}](:/${id})` : `[${shown}](:/${id})`;
	}
	return out + body.slice(last);
}
