import joplin from 'api';
import { ToastType } from 'api/types';
import { CloudClient } from './cloud-shared/client.mjs';
import { createLink, listLinks, removeLink } from './cloud-shared/links.mjs';
import { createListLink, hasChecklist, listListLinks, openList, removeListLink } from './cloud-shared/list-links.mjs';
import { checkLink, copyText, joplinPath, lastMarks, noteIdOf, tooLarge } from './shareLink.mjs';

// A note shared by link, from the board on Joplin desktop with JotDrop Cloud connected: a copy anyone can read, or a
// live list anyone can tick. Only a note you share this way goes to the cloud, sealed with a key that is only in the link.
// Every 30 seconds the cloud check brings guests' ticks into the note and your own ticks into the link.

type Credentials = { url: string; vaultId: string; vaultKey: string } & Record<string, unknown>;
type ListLink = { id: string; revision: number; updatedAt: string | null; expiresAt: string | null; title: string; path: string | null; key: string | null; base: any; address: string | null };
export type NoteWriter = (id: string, body: string, updatedTime: number) => Promise<boolean>;

const STRINGS = {
	en: {
		ended: (title: string) => `The live list link of "${title}" has ended, because the note is in the trash.`,
		untitled: 'Untitled note',
		noChecklist: 'This note has no checklist.',
		tooLarge: 'This list is too large for a link. A link holds about 48 KB of text.',
		connectFirst: 'Connect JotDrop Cloud first.',
		plus: 'You can try JotDrop Plus free for 14 days on the website.',
		failed: 'Something went wrong. Try again.',
	},
	nl: {
		ended: (title: string) => `De live lijstlink van "${title}" is gestopt, want de notitie staat in de prullenbak.`,
		untitled: 'Notitie zonder titel',
		noChecklist: 'Deze notitie heeft geen checklist.',
		tooLarge: 'Deze lijst is te groot voor een link. Een link bevat ongeveer 48 KB tekst.',
		connectFirst: 'Koppel eerst JotDrop Cloud.',
		plus: 'Op de website kun je JotDrop Plus 14 dagen gratis proberen.',
		failed: 'Er ging iets mis. Probeer het nog eens.',
	},
};
const text = async () => STRINGS[String(await joplin.settings.globalValue('locale') || 'en').slice(0, 2)] || STRINGS.en;

let getCredentials: () => Promise<Credentials | null> = async () => null;
let writeNote: NoteWriter = async () => false;
// Notes with a live list link, from the last look at the server: the board shows it on the card.
let linked = new Set<string>();
let lists: ListLink[] = [];
let checking: Promise<boolean> | null = null;

export function setupShareLinks(credentials: () => Promise<Credentials | null>, writer: NoteWriter) {
	getCredentials = credentials;
	writeNote = writer;
}

export const hasListLink = (id: string) => linked.has(id);
/** After disconnecting: no more marks on the cards. */
export const forgetListLinks = () => remember([]);

async function client() {
	const stored = await getCredentials();
	return stored ? new CloudClient(stored) : null;
}

const getNote = async (id: string) => joplin.data.get(['notes', id], { fields: ['id', 'title', 'body', 'updated_time', 'deleted_time'] }).catch(() => null);

// An ended link stays on the server (Plus can bring it back), but there is nothing to keep in step.
const live = (link: ListLink) => !link.expiresAt || Date.parse(link.expiresAt) > Date.now();

function remember(found: ListLink[]) {
	lists = found;
	linked = new Set(found.filter(live).map((link) => noteIdOf(link.path)).filter((id): id is string => !!id));
}

/** One look at your list links; true when a note changed. One check at a time, and a link that fails never stops the others. */
export function checkListLinks(): Promise<boolean> {
	checking ??= (async () => {
		const cloud = await client();
		if (!cloud) { remember([]); return false; }
		const found: ListLink[] = await listListLinks(cloud);
		const before = [...linked].sort().join();
		remember(found);
		// A link made or ended on another computer changes the mark on a card.
		let changed = [...linked].sort().join() !== before;
		for (const link of found.filter(live)) {
			try {
				const result = await checkLink(cloud, link, {
					getNote,
					writeNote,
					endLink: async (id: string) => {
						await removeListLink(cloud, id);
						joplin.views.dialogs.showToast({ message: (await text()).ended(link.title || (await text()).untitled), type: ToastType.Info, duration: 8000 }).catch(() => {});
					},
				});
				if (result === 'note' || result === 'ended') changed = true;
				if (result === 'ended') linked.delete(String(noteIdOf(link.path)));
			} catch (error) {
				console.warn('JotDrop list link:', link.id, error);
			}
		}
		return changed;
	})().finally(() => { checking = null; });
	return checking;
}

function problem(error: any, t: typeof STRINGS.en, url: string) {
	const message = error instanceof Error && error.message ? error.message : t.failed;
	return error?.code === 'plus-required' ? { problem: `${message} ${t.plus}`, plusUrl: url } : { problem: message };
}

/** What the share menu shows for one note: whether it can be a live list, and your links. */
export async function shareInfo(id: string) {
	const cloud = await client();
	if (!cloud) return { connected: false };
	const note = id ? await getNote(id) : null;
	const [copies, found] = await Promise.all([listLinks(cloud), listListLinks(cloud) as Promise<ListLink[]>]);
	remember(found);
	const shown = await Promise.all(found.map(async (link) => {
		const noteId = noteIdOf(link.path);
		const marks = link.key ? await openList(cloud.credentials.url, link.id, link.key).then((list: any) => lastMarks(list.lines)).catch(() => []) : [];
		const here = noteId ? !!(await getNote(noteId)) : null;
		return { id: link.id, title: link.title, expiresAt: link.expiresAt, updatedAt: link.updatedAt, address: link.address, mine: noteId === id, here, marks };
	}));
	return { connected: true, checklist: !!note && hasChecklist(String(note.body || '')), links: copies, lists: shown };
}

/** Makes a copy link or a live list link of one note. A refusal of the server comes back as `problem`. */
export async function makeLink(id: string, kind: string, days: number) {
	const t = await text();
	const cloud = await client();
	if (!cloud) return { problem: t.connectFirst };
	const note = await getNote(id);
	if (!note || note.deleted_time) return { problem: t.failed };
	const title = String(note.title || ''), body = String(note.body || '');
	try {
		if (kind === 'list') {
			if (!hasChecklist(body)) return { problem: t.noChecklist };
			if (tooLarge(body)) return { problem: t.tooLarge };
			const link = await createListLink(cloud, { title, text: body }, { origin: cloud.credentials.url, days, path: joplinPath(id), noteRevision: Number(note.updated_time) });
			linked.add(id);
			return { address: link.address };
		}
		const link = await createLink(cloud, { title: title || t.untitled, text: copyText(body) }, { origin: cloud.credentials.url, days });
		return { address: link.address };
	} catch (error) {
		if ((error as any)?.code !== 'plus-required') console.warn('JotDrop link:', error);
		return problem(error, t, cloud.credentials.url);
	}
}

export async function endLink(linkId: string, kind: string) {
	const cloud = await client();
	if (!cloud) return false;
	if (kind === 'list') {
		await removeListLink(cloud, linkId);
		remember(lists.filter((link) => link.id !== linkId));
	} else {
		await removeLink(cloud, linkId);
	}
	return true;
}
