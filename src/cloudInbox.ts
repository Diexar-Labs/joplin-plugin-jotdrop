import joplin from 'api';
import { ModelType, SettingItemType } from 'api/types';
import { CloudClient, CloudError } from './cloud-shared/client.mjs';
import { noteSummary } from './cloud-shared/note.mjs';
import { remoteFiles } from './cloud-shared/sync.mjs';
import { baseline, createdTime, followMoves, isCloudNote, linkAttachments, stableId, titleAndBody, wantedTags } from './cloudNote.mjs';

// JotDrop Cloud on Joplin desktop, one way: what the JotDrop app puts in the cloud becomes ordinary Joplin notes
// in the notebook JotDrop. Nothing goes back, and a note edited or removed in Joplin is left alone.
// Desktop only: a plugin can only write attachments on desktop, and Joplin's own sync brings the notes to the phone.

const COLORS = new Set(['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'gray']);
const EVERY = 30 * 1000;
const LONGEST_WAIT = 5 * 60 * 1000;
const SAVE_EVERY = 1000;

const STRINGS = {
	en: {
		title: 'Connect JotDrop Cloud',
		intro: 'Notes you make in the JotDrop app then appear here as ordinary Joplin notes, in the notebook JotDrop. On the way they are end-to-end encrypted.',
		howCode: 'In the JotDrop app, open JotDrop Cloud and tap Create pairing code. On app.jotdrop.net it is under Connected devices. Paste the code here; it works for 10 minutes.',
		codeLabel: 'Pairing code',
		which: 'Which notes should come in?',
		onlyNew: 'Only new notes. What is already in your cloud stays out of Joplin.',
		everything: 'Everything. All notes already in your cloud come in too.',
		oneComputer: 'Joplin on several computers? Connect just one. Joplin\'s own sync takes the notes to the others.',
		noAccount: 'No account yet? Get the JotDrop app, or sign up at app.jotdrop.net.',
		connect: 'Connect', cancel: 'Cancel', close: 'Close', checkNow: 'Check now', disconnect: 'Disconnect',
		statusTitle: 'JotDrop Cloud',
		connectedLine: 'Connected. New notes from the JotDrop app come in while Joplin is open.',
		broughtIn: (n: number) => (n === 1 ? '1 note brought in so far.' : `${n} notes brought in so far.`),
		lastCheck: (time: string) => `Last check: ${time}.`,
		busy: (done: number, total: number) => `Bringing in notes: ${done} of ${total}.`,
		problem: (text: string) => `⚠ ${text}`,
		afterDisconnect: 'Disconnecting keeps the notes that are already here.',
		connected: 'Connected. New notes will appear here soon.',
		connectedAll: 'Connected. Your notes are on their way.',
		disconnected: 'Disconnected from JotDrop Cloud. Your notes stay in Joplin.',
		disconnectedOffline: 'Disconnected here, but the cloud could not be reached. Remove this device in the JotDrop app under Connected devices.',
		nothingNew: 'JotDrop Cloud: nothing new',
		arrived: (n: number) => (n === 1 ? '1 note from JotDrop Cloud' : `${n} notes from JotDrop Cloud`),
		emptyCode: 'Paste a pairing code first.',
		badCode: 'This pairing code is not valid. Make a new one in the JotDrop app.',
		usedCode: 'This pairing code was already used. Make a new one in the JotDrop app.',
		expiredCode: 'This pairing code has expired. Make a new one in the JotDrop app.',
		deviceLimit: 'All devices on your free plan are in use. Sign out one of them in the JotDrop app, or try JotDrop Plus.',
		tooMany: 'Too many tries. Wait a minute and try again.',
		offline: 'JotDrop Cloud cannot be reached. Check your internet connection.',
		failed: 'JotDrop Cloud did not answer as expected. Try again later.',
		someFailed: (n: number) => (n === 1 ? '1 note could not come in yet. JotDrop tries again by itself.' : `${n} notes could not come in yet. JotDrop tries again by itself.`),
		removed: 'This Joplin was removed from your JotDrop Cloud. Connect again with a new pairing code.',
	},
	nl: {
		title: 'JotDrop Cloud koppelen',
		intro: 'Notities uit de JotDrop-app verschijnen dan hier als gewone Joplin-notities, in het notitieboek JotDrop. Onderweg zijn ze end-to-end versleuteld.',
		howCode: 'Open in de JotDrop-app JotDrop Cloud en tik op Create pairing code. Op app.jotdrop.net staat het onder Connected devices. Plak de code hier; hij werkt 10 minuten.',
		codeLabel: 'Koppelcode',
		which: 'Welke notities moeten binnenkomen?',
		onlyNew: 'Alleen nieuwe notities. Wat al in je cloud staat, blijft buiten Joplin.',
		everything: 'Alles. Ook alle notities die al in je cloud staan komen binnen.',
		oneComputer: 'Joplin op meer computers? Koppel er maar één. Joplins eigen sync brengt de notities naar de andere.',
		noAccount: 'Nog geen account? Haal de JotDrop-app, of meld je aan op app.jotdrop.net.',
		connect: 'Koppelen', cancel: 'Annuleren', close: 'Sluiten', checkNow: 'Nu ophalen', disconnect: 'Loskoppelen',
		statusTitle: 'JotDrop Cloud',
		connectedLine: 'Gekoppeld. Nieuwe notities uit de JotDrop-app komen binnen zolang Joplin openstaat.',
		broughtIn: (n: number) => (n === 1 ? 'Tot nu toe 1 notitie binnengehaald.' : `Tot nu toe ${n} notities binnengehaald.`),
		lastCheck: (time: string) => `Laatst gekeken: ${time}.`,
		busy: (done: number, total: number) => `Notities binnenhalen: ${done} van ${total}.`,
		problem: (text: string) => `⚠ ${text}`,
		afterDisconnect: 'Na loskoppelen blijven de notities die hier al staan gewoon staan.',
		connected: 'Gekoppeld. Nieuwe notities verschijnen hier zo.',
		connectedAll: 'Gekoppeld. Je notities komen eraan.',
		disconnected: 'Losgekoppeld van JotDrop Cloud. Je notities blijven in Joplin.',
		disconnectedOffline: 'Hier losgekoppeld, maar de cloud was niet bereikbaar. Haal dit apparaat weg in de JotDrop-app onder Connected devices.',
		nothingNew: 'JotDrop Cloud: niets nieuws',
		arrived: (n: number) => (n === 1 ? '1 notitie uit JotDrop Cloud' : `${n} notities uit JotDrop Cloud`),
		emptyCode: 'Plak eerst een koppelcode.',
		badCode: 'Deze koppelcode klopt niet. Maak een nieuwe in de JotDrop-app.',
		usedCode: 'Deze koppelcode is al gebruikt. Maak een nieuwe in de JotDrop-app.',
		expiredCode: 'Deze koppelcode is verlopen. Maak een nieuwe in de JotDrop-app.',
		deviceLimit: 'Alle apparaten van je gratis plan zijn in gebruik. Meld er een af in de JotDrop-app, of probeer JotDrop Plus.',
		tooMany: 'Te vaak geprobeerd. Wacht een minuut en probeer het opnieuw.',
		offline: 'JotDrop Cloud is niet bereikbaar. Controleer je internetverbinding.',
		failed: 'JotDrop Cloud gaf geen geldig antwoord. Probeer het later opnieuw.',
		someFailed: (n: number) => (n === 1 ? '1 notitie kon nog niet binnenkomen. JotDrop probeert het vanzelf opnieuw.' : `${n} notities konden nog niet binnenkomen. JotDrop probeert het vanzelf opnieuw.`),
		removed: 'Deze Joplin is uit je JotDrop Cloud gehaald. Koppel opnieuw met een nieuwe koppelcode.',
	},
};
type Text = typeof STRINGS.en;

const text = async (): Promise<Text> => STRINGS[String(await joplin.settings.globalValue('locale') || 'en').slice(0, 2)] || STRINGS.en;

// `text` fingerprints the title and text as they came in, so an edit in Joplin shows on any computer.
type Kept = { id?: string; hash: string; text?: string; color?: string; pinned?: boolean; tags?: string[]; due?: number; skip?: boolean };
type State = { vaultId: string; mode: 'new' | 'all'; baselined: boolean; index: any; notes: Record<string, Kept> };

// Lost or unreadable state means nothing extra comes in: the safe side of "only new notes".
const freshState = (vaultId: string): State => ({ vaultId, mode: 'new', baselined: false, index: { cursor: 0, objects: {} }, notes: {} });

const fs = () => joplin.require('fs-extra');
const statePath = async () => `${await joplin.plugins.dataDir()}/cloud-state.json`;

async function loadState(vaultId: string): Promise<State> {
	try {
		const state = JSON.parse(await fs().readFile(await statePath(), 'utf8'));
		if (state.vaultId === vaultId) return state;
	} catch {
		// No file yet, or an unreadable one.
	}
	return freshState(vaultId);
}

// A write that is cut off leaves the old file intact.
async function saveState(state: State) {
	const path = await statePath();
	await fs().writeFile(`${path}.new`, JSON.stringify(state));
	await fs().move(`${path}.new`, path, { overwrite: true });
}

export async function registerCloudSettings() {
	await joplin.settings.registerSettings({
		cloudCredentials: { value: '', type: SettingItemType.String, section: 'jotdrop', public: false, secure: true, label: 'JotDrop Cloud device' },
	});
}

const credentials = async () => {
	const stored = String(await joplin.settings.value('cloudCredentials') || '');
	return stored ? JSON.parse(stored) : null;
};

let running: Promise<any> | null = null;
let stopping = false;
let failures = 0;
let nextCheck = 0;
const status = { done: 0, total: 0, lastCheck: 0, problem: '', brought: 0 };

function problemFor(error: any, t: Text) {
	if (error?.code === 'device-limit') return t.deviceLimit;
	if (error?.status === 429) return t.tooMany;
	if (error instanceof CloudError) return t.failed;
	if (error instanceof TypeError || error?.name === 'TimeoutError' || error?.name === 'AbortError') return t.offline;
	return t.failed;
}

async function resourceFor(vaultId: string, file: any) {
	const id = await stableId(vaultId, `${file.path}\n${file.hash}`);
	const known = await joplin.data.get(['resources', id], { fields: ['id', 'mime', 'title'] }).catch(() => null);
	if (known) return known;
	// The resource API takes a file path, and only desktop can write one.
	const name = file.path.split('/').pop();
	const temp = `${await joplin.plugins.dataDir()}/${id}${/\.[\w-]+$/.exec(name)?.[0] || ''}`;
	await fs().writeFile(temp, await file.bytes());
	try {
		return await joplin.data.post(['resources'], null, { id, title: name }, [{ path: temp }]);
	} finally {
		await fs().remove(temp);
	}
}

async function allTags() {
	const tags = new Map<string, string>();
	for (let page = 1; ; page++) {
		const found = await joplin.data.get(['tags'], { fields: ['id', 'title'], limit: 100, page });
		for (const tag of found.items) tags.set(tag.title, tag.id);
		if (!found.has_more) return tags;
	}
}

const metaOf = (summary: any) => ({ color: COLORS.has(summary.color) ? summary.color : '', pinned: !!summary.pinned, due: Date.parse(summary.reminder || '') || 0, tags: wantedTags(summary) });

// Only what changed in the app since the last time, so a colour or pin set on the board stays.
async function applyMeta(id: string, summary: any, before: Kept | undefined, tags: Map<string, string>) {
	const { color, pinned, due, tags: wanted } = metaOf(summary);
	const keep = async (key: string, value: unknown, old: unknown) => {
		if (value === (old ?? (typeof value === 'string' ? '' : false))) return;
		if (value) await joplin.data.userDataSet(ModelType.Note, id, key, value);
		else await joplin.data.userDataDelete(ModelType.Note, id, key);
	};
	await keep('color', color, before?.color);
	await keep('pinned', pinned, before?.pinned);
	if (due && due !== before?.due) {
		await joplin.data.userDataSet(ModelType.Note, id, 'madeTodo', true);
		await joplin.data.put(['notes', id], null, { is_todo: 1, todo_due: due });
	} else if (!due && before?.due) {
		await joplin.data.userDataDelete(ModelType.Note, id, 'madeTodo');
		await joplin.data.put(['notes', id], null, { is_todo: 0, todo_due: 0, todo_completed: 0 });
	}
	for (const title of wanted) {
		if (before?.tags?.includes(title)) continue;
		if (!tags.has(title)) tags.set(title, (await joplin.data.post(['tags'], null, { title })).id);
		await joplin.data.post(['tags', tags.get(title)!, 'notes'], null, { id });
	}
	for (const title of before?.tags || []) {
		if (!wanted.includes(title) && tags.has(title)) await joplin.data.delete(['tags', tags.get(title)!, 'notes', id]);
	}
}

const byPath = (files: any[], path: string) => files.find((item) => item.path === path);

async function importNote(file: any, known: Kept | undefined, state: State, files: any[], available: string[], tags: Map<string, string>) {
	const fingerprint = (note: { title: string; body: string }) => stableId(state.vaultId, `${note.title}\n${note.body}`);
	const id = known?.id || await stableId(state.vaultId, file.path);
	const note = await joplin.data.get(['notes', id], { fields: ['title', 'body', 'deleted_time'] }).catch(() => null);
	// Removed in Joplin since it came in: it stays removed.
	if (known?.id && (!note || note.deleted_time)) {
		state.notes[file.path] = { ...known, hash: file.hash };
		return 'kept';
	}
	const summary = noteSummary(new TextDecoder().decode(await file.bytes()), file.path);
	const { title, body: written } = titleAndBody(summary);
	if (!known?.id && note) {
		// Already here through Joplin's own sync from another connected computer.
		state.notes[file.path] = { id, hash: file.hash, text: await fingerprint(note), ...metaOf(summary) };
		return 'kept';
	}
	if (known?.id && await fingerprint(note) !== known.text) {
		// Different from what came in: another computer already brought this version, or it was edited here and Joplin's version wins.
		const existing = async (path: string) => {
			const resource = { id: await stableId(state.vaultId, `${path}\n${byPath(files, path).hash}`), mime: '', title: '' };
			return await joplin.data.get(['resources', resource.id], { fields: ['id', 'mime', 'title'] }).catch(() => resource);
		};
		const same = note.title === title && note.body === await linkAttachments(written, file.path, available, existing);
		state.notes[file.path] = same ? { ...known, hash: file.hash, text: await fingerprint(note), ...metaOf(summary) } : { ...known, hash: file.hash };
		return 'kept';
	}
	const body = await linkAttachments(written, file.path, available, (path: string) => resourceFor(state.vaultId, byPath(files, path)));
	if (known?.id) await joplin.data.put(['notes', id], null, { title, body });
	else await joplin.data.post(['notes'], null, { id, title, body, parent_id: await inboxFolder(), ...createdTime(file.path) });
	await applyMeta(id, summary, known?.id ? known : undefined, tags);
	const stored = await joplin.data.get(['notes', id], { fields: ['title', 'body'] });
	state.notes[file.path] = { id, hash: file.hash, text: await fingerprint(stored), ...metaOf(summary) };
	return known?.id ? 'updated' : 'added';
}

let getInboxFolder: () => Promise<string> = async () => '';
const inboxFolder = () => getInboxFolder();

async function pull(t: Text) {
	const client = new CloudClient(await credentials());
	const state = await loadState(client.credentials.vaultId);
	let savedAt = Date.now();
	const save = () => saveState(state);
	const checkActive = () => { if (stopping) throw new DOMException('Disconnecting', 'AbortError'); };
	const files: any[] = await remoteFiles(client, state.index, { save, checkActive });
	if (state.mode === 'new' && !state.baselined) baseline(files, state.notes);
	state.baselined = true;
	followMoves(files, state.notes);
	await save();
	const waiting = files.filter((file) => !file.deleted && isCloudNote(file.path) && !state.notes[file.path]?.skip && state.notes[file.path]?.hash !== file.hash).sort((a, b) => (a.path < b.path ? -1 : 1));
	const available = files.filter((file) => !file.deleted && file.path.startsWith('attachments/')).map((file) => file.path);
	const result = { added: 0, updated: 0, kept: 0, failed: 0 };
	status.total = waiting.length;
	status.done = 0;
	status.problem = '';
	const tags = waiting.length ? await allTags() : new Map<string, string>();
	try {
		for (const file of waiting) {
			checkActive();
			try {
				result[await importNote(file, state.notes[file.path], state, files, available, tags)]++;
			} catch (error) {
				// The cloud or the connection: the rest would fail as well. Anything else stays with this one note.
				if (error instanceof CloudError || error instanceof TypeError || (error as Error)?.name === 'TimeoutError' || (error as Error)?.name === 'AbortError') throw error;
				console.warn('JotDrop Cloud:', file.path, error);
				result.failed++;
			}
			status.done++;
			if (Date.now() - savedAt >= SAVE_EVERY) { await save(); savedAt = Date.now(); }
		}
	} finally {
		await save();
		status.total = 0;
	}
	status.lastCheck = Date.now();
	status.brought = Object.values(state.notes).filter((note) => note.id).length;
	if (result.failed) status.problem = t.someFailed(result.failed);
	return result;
}

/** Checks the cloud; one check at a time. */
function pullCloud() {
	running ??= (async () => {
		const t = await text();
		try {
			const result = await pull(t);
			if (!result.failed) { failures = 0; nextCheck = 0; }
			return result;
		} catch (error) {
			if (stopping) return { added: 0, updated: 0, kept: 0, failed: 0 };
			// This device was revoked: no more tries until someone connects again.
			if ((error as any)?.status === 401) {
				await joplin.settings.setValue('cloudCredentials', '');
				status.problem = t.removed;
			} else {
				status.problem = problemFor(error, t);
			}
			throw error;
		}
	})().finally(() => { running = null; });
	return running;
}

/** Looks every 30 seconds and waits longer after each failure, so a problem does not hammer the cloud. A check that works, or connecting again, ends the wait. */
export function startCloud(inbox: () => Promise<string>, changed: () => Promise<void>) {
	getInboxFolder = inbox;
	const tick = async () => {
		if (running || stopping || Date.now() < nextCheck || !(await credentials())) return;
		try {
			const result = await pullCloud();
			if (result.added || result.updated) await changed();
			if (result.failed) failures++;
		} catch (error) {
			failures++;
			console.warn('JotDrop Cloud:', error);
			await changed().catch(() => {});
		}
		if (failures) nextCheck = Date.now() + Math.min(EVERY * 2 ** failures, LONGEST_WAIT);
	};
	setTimeout(tick, 2000);
	setInterval(tick, EVERY);
}

/** What the board's Cloud button shows. */
export async function cloudStatus() {
	const connected = !!(await credentials());
	return { connected, done: status.done, total: status.total, problem: !!status.problem };
}

let dialog = '';
async function ask(html: string, buttons: { id: string; title: string }[]) {
	if (!dialog) dialog = await joplin.views.dialogs.create('jotdropCloudDialog');
	await joplin.views.dialogs.setHtml(dialog, html);
	await joplin.views.dialogs.setButtons(dialog, buttons);
	return joplin.views.dialogs.open(dialog);
}

// Joplin sizes a dialog to this element, which would otherwise stay as narrow as the empty dialog.
const DIALOG_STYLE = '<style>#joplin-plugin-content{width:480px;line-height:1.45}#jd-code{width:100%;box-sizing:border-box;padding:5px;color:var(--joplin-color);background:var(--joplin-background-color);border:1px solid var(--joplin-color)}</style>';

const connectForm = (t: Text, problem: string) => `${DIALOG_STYLE}
	<form name="cloud">
		<h3 style="margin:0 0 8px">${t.title}</h3>
		<p style="margin:0 0 8px">${t.intro}</p>
		<p style="margin:0 0 10px">${t.howCode}</p>
		${problem ? `<p role="alert" style="margin:0 0 10px;font-weight:600">${t.problem(problem)}</p>` : ''}
		<label for="jd-code" style="display:block;font-weight:600;margin-bottom:4px">${t.codeLabel}</label>
		<input id="jd-code" name="code" autocomplete="off" spellcheck="false">
		<p style="margin:12px 0 4px;font-weight:600">${t.which}</p>
		<label style="display:block;margin-bottom:4px"><input type="radio" name="mode" value="new" checked> ${t.onlyNew}</label>
		<label style="display:block"><input type="radio" name="mode" value="all"> ${t.everything}</label>
		<p style="margin:12px 0 0">${t.oneComputer}</p>
		<p style="margin:6px 0 0">${t.noAccount}</p>
	</form>`;

const statusForm = (t: Text) => `${DIALOG_STYLE}
	<div>
		<h3 style="margin:0 0 8px">${t.statusTitle}</h3>
		<p style="margin:0 0 6px">${status.problem ? "" : "✓ "}${t.connectedLine}</p>
		${status.total ? `<p style="margin:0 0 6px">${t.busy(status.done, status.total)}</p>` : ''}
		${status.brought ? `<p style="margin:0 0 6px">${t.broughtIn(status.brought)}</p>` : ''}
		${status.lastCheck ? `<p style="margin:0 0 6px">${t.lastCheck(new Date(status.lastCheck).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }))}</p>` : ''}
		${status.problem ? `<p role="alert" style="margin:0 0 6px;font-weight:600">${t.problem(status.problem)}</p>` : ''}
		<p style="margin:8px 0 0">${t.afterDisconnect}</p>
	</div>`;

async function connect(code: string, mode: 'new' | 'all') {
	const client = await CloudClient.claim({ pairingCode: code });
	const state = await loadState(client.credentials.vaultId);
	state.mode = mode;
	state.baselined = false;
	// Connecting again and now choosing everything: what stayed out earlier may come in after all.
	if (mode === 'all') for (const [path, note] of Object.entries(state.notes)) if (note.skip) delete state.notes[path];
	await saveState(state);
	await joplin.settings.setValue('cloudCredentials', JSON.stringify(client.credentials));
	status.problem = '';
}

function connectProblem(error: any, t: Text) {
	if (error?.status === 401) return t.badCode;
	if (error?.status === 409) return t.usedCode;
	if (error?.status === 410) return t.expiredCode;
	// Not a code at all: claim cannot decode it.
	if (error instanceof SyntaxError || (error instanceof Error && !(error instanceof TypeError) && !(error instanceof CloudError) && error.name !== 'TimeoutError' && error.name !== 'AbortError')) return t.badCode;
	return problemFor(error, t);
}

async function disconnect(t: Text) {
	stopping = true;
	await running?.catch(() => {});
	let reached = true;
	const stored = await credentials();
	if (stored) await new CloudClient(stored).revokeDevice(stored.deviceId).catch((error) => { reached = error?.status === 401; });
	await joplin.settings.setValue('cloudCredentials', '');
	stopping = false;
	Object.assign(status, { done: 0, total: 0, problem: '', brought: 0, lastCheck: 0 });
	return reached ? t.disconnected : t.disconnectedOffline;
}

/** The board's Cloud button: connect, or show how it is going. Returns a line for the board to show. */
export async function openCloud(changed: () => Promise<void>): Promise<{ message: string }> {
	const t = await text();
	if (!(await credentials())) {
		for (let problem = status.problem; ;) {
			const answer = await ask(connectForm(t, problem), [{ id: 'ok', title: t.connect }, { id: 'cancel', title: t.cancel }]);
			if (answer.id !== 'ok') return { message: '' };
			const code = String(answer.formData?.cloud?.code || '').replace(/\s+/g, '');
			const mode = answer.formData?.cloud?.mode === 'all' ? 'all' : 'new';
			if (!code) { problem = t.emptyCode; continue; }
			try {
				await connect(code, mode);
			} catch (error) {
				console.warn('JotDrop Cloud: connect', error);
				problem = connectProblem(error, t);
				continue;
			}
			pullCloud().then(changed, () => changed()).catch(() => {});
			return { message: mode === 'all' ? t.connectedAll : t.connected };
		}
	}
	const answer = await ask(statusForm(t), [{ id: 'check', title: t.checkNow }, { id: 'disconnect', title: t.disconnect }, { id: 'close', title: t.close }]);
	if (answer.id === 'disconnect') return { message: await disconnect(t) };
	if (answer.id !== 'check') return { message: '' };
	try {
		const result = await pullCloud();
		const count = result.added + result.updated;
		await changed();
		return { message: result.failed ? t.someFailed(result.failed) : count ? t.arrived(count) : t.nothingNew };
	} catch {
		return { message: status.problem || t.failed };
	}
}
