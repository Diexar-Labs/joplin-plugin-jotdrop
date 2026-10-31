import joplin from 'api';
import { MenuItemLocation, ModelType, SettingItemType, ToolbarButtonLocation } from 'api/types';
import { cloudStatus, openCloud, registerCloudSettings, startCloud } from './cloudInbox';

// JotDrop for Joplin. One special note is the board: when it is open, the JotDrop editor view
// shows every other note as a Keep-style card. Colour, pin, archive and the card's place live in
// the note's user_data (synced by Joplin, never written into the note text).

const PLUGIN_ID = 'net.jotdrop.joplin';
const VIEW_ID = 'jotdropBoard';
const BOARD_FENCE = '```jotdrop-board';
const BOARD_BODY = `This note is your JotDrop board. With the JotDrop plugin it shows all your notes as cards.\n\n${BOARD_FENCE}\nversion: 1\n\`\`\`\n`;
const COLORS = new Set(['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'gray']);
const BOARD_FOLDER = 'JotDrop';
// Everything a card needs except the text: the board sorts and filters on this, and fetches the
// text only for the cards it actually shows, so thousands of notes stay light.
const META_FIELDS = ['id', 'parent_id', 'title', 'is_todo', 'todo_completed', 'todo_due', 'user_created_time', 'updated_time', 'user_data'];
const PREVIEW_CHARS = 6000;

const views = new Set<string>();
const imageCache = new Map<string, string | null>();
let platform = 'desktop';

const isBoardBody = (body: string | undefined) => !!body && body.includes(BOARD_FENCE);
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function allPages(path: string[], query: Record<string, unknown> = {}): Promise<any[]> {
	const out: any[] = [];
	for (let page = 1; ; page++) {
		const result = await joplin.data.get(path, { ...query, page, limit: 100 });
		if (Array.isArray(result)) return result;
		out.push(...result.items);
		if (!result.has_more) return out;
	}
}

function readUserData(raw: string | undefined): Record<string, unknown> {
	if (!raw) return {};
	try {
		const mine = JSON.parse(raw)[PLUGIN_ID] || {};
		const values: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries<any>(mine)) if (entry && !entry.d) values[key] = entry.v;
		return values;
	} catch {
		return {};
	}
}

function fileUrl(path: string) {
	return path.startsWith('/') ? `file://${encodeURI(path)}` : `file:///${encodeURI(path.replace(/\\/g, '/'))}`;
}

async function firstImage(body: string): Promise<{ id: string; url: string } | null> {
	const ids = [...body.matchAll(/!\[[^\]]*\]\(:\/([0-9a-fA-F]{32})[^)]*\)|<img\b[^>]*\bsrc=["']:\/([0-9a-fA-F]{32})/g)].map((m) => m[1] || m[2]);
	for (const id of ids) {
		if (!imageCache.has(id)) {
			try {
				const resource = await joplin.data.get(['resources', id], { fields: ['id', 'mime'] });
				imageCache.set(id, resource && String(resource.mime).startsWith('image/') ? fileUrl(await joplin.data.resourcePath(id)) : null);
			} catch {
				imageCache.set(id, null);
			}
		}
		const url = imageCache.get(id);
		if (url) return { id, url };
	}
	return null;
}

const AUDIO_LINK = /(?<!!)\[[^\]]*\]\(:\/([0-9a-fA-F]{32})[^)]*\)/g;

// The first sound in a note plays on the card; its link is not shown as text as well.
async function firstAudio(body: string) {
	for (const match of body.matchAll(AUDIO_LINK)) {
		try {
			const resource = await joplin.data.get(['resources', match[1]], { fields: ['mime'] });
			if (String(resource?.mime).startsWith('audio/')) return { link: match[0], url: fileUrl(await joplin.data.resourcePath(match[1])) };
		} catch {
			// A link to a resource that is gone: no player.
		}
	}
	return null;
}

function toMeta(note: any, tags: string[]) {
	const meta = readUserData(note.user_data);
	return {
		id: note.id,
		folderId: note.parent_id,
		title: note.title || '',
		isTodo: !!note.is_todo,
		done: !!note.todo_completed,
		due: note.todo_due || 0,
		updated: note.updated_time,
		rank: typeof meta.rank === 'number' ? meta.rank : note.user_created_time,
		pinned: meta.pinned === true,
		archived: meta.archived === true,
		color: COLORS.has(String(meta.color)) ? String(meta.color) : 'default',
		tags,
	};
}

async function preview(id: string) {
	const note = await joplin.data.get(['notes', id], { fields: ['id', 'body', 'updated_time'] });
	const body: string = note.body || '';
	const audio = await firstAudio(body);
	return { id, updated: note.updated_time, body: (audio ? body.replace(audio.link, '') : body).slice(0, PREVIEW_CHARS), image: await firstImage(body), audio: audio?.url || null };
}

async function tagMap(): Promise<Map<string, string[]>> {
	const map = new Map<string, string[]>();
	for (const tag of await allPages(['tags'], { fields: ['id', 'title'] })) {
		for (const note of await allPages(['tags', tag.id, 'notes'], { fields: ['id'] })) {
			if (!map.has(note.id)) map.set(note.id, []);
			map.get(note.id)!.push(tag.title);
		}
	}
	return map;
}

async function cardFor(id: string) {
	const tags = (await allPages(['notes', id, 'tags'], { fields: ['title'] })).map((tag) => tag.title);
	const [note, shown] = await Promise.all([joplin.data.get(['notes', id], { fields: META_FIELDS }), preview(id)]);
	return { ...toMeta(note, tags), preview: shown };
}

async function loadBoard() {
	const boardId = await findBoardNoteId();
	const [notes, folders, tags] = await Promise.all([
		allPages(['notes'], { fields: META_FIELDS }),
		allPages(['folders'], { fields: ['id', 'title', 'parent_id'] }),
		tagMap(),
	]);
	const cards = notes
		.filter((note) => note.id !== boardId && readUserData(note.user_data).board !== true)
		.map((note) => toMeta(note, tags.get(note.id) || []));
	return { cards, folders, platform, boardFolder: await boardFolderId(), locale: String(await joplin.settings.globalValue('locale') || 'en'), cloud: platform === 'desktop' ? await cloudStatus() : null };
}

// Joplin's own full-text index, so a search also finds text in cards the board has not fetched.
async function searchNotes(text: string) {
	const words = String(text).replace(/[":*()\-]/g, ' ').split(/\s+/).filter(Boolean);
	if (!words.length) return [];
	const found = await allPages(['search'], { query: words.map((word) => `${word}*`).join(' '), type: 'note', fields: ['id'] });
	return found.map((note) => note.id);
}

// Joplin raises its alarm only for a to-do, so a reminder on a plain note turns it into one.
// A flag remembers that, and removing the reminder makes it a plain note again.
async function setReminder(id: string, due: number) {
	const note = await joplin.data.get(['notes', id], { fields: ['is_todo', 'user_data'] });
	if (due > 0) {
		if (!note.is_todo) await joplin.data.userDataSet(ModelType.Note, id, 'madeTodo', true);
		await joplin.data.put(['notes', id], null, { is_todo: 1, todo_due: due, todo_completed: 0 });
	} else if (readUserData(note.user_data).madeTodo === true) {
		await joplin.data.userDataDelete(ModelType.Note, id, 'madeTodo');
		await joplin.data.put(['notes', id], null, { is_todo: 0, todo_due: 0, todo_completed: 0 });
	} else {
		await joplin.data.put(['notes', id], null, { todo_due: 0 });
	}
	return cardFor(id);
}

// The API has no compare-and-swap, so the body is read again right before the write and the
// checklist line must still be a checklist line (same rule as the website's toggleTask).
async function toggleTask(id: string, line: number, checked: boolean) {
	const note = await joplin.data.get(['notes', id], { fields: ['id', 'body'] });
	const lines = String(note.body || '').split('\n');
	if (!/^\s*[-*+] \[[ xX]\] /.test(lines[line] || '')) throw new Error('changed');
	lines[line] = lines[line].replace(/^(\s*[-*+] \[)[ xX](\] )/, `$1${checked ? 'x' : ' '}$2`);
	await joplin.data.put(['notes', id], null, { body: lines.join('\n') });
	return cardFor(id);
}

function base64(bytes: Uint8Array) {
	let text = '';
	for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(text);
}

// Fallback when the webview may not read the resource file directly (expected on mobile).
async function imageData(id: string) {
	const resource = await joplin.data.get(['resources', id], { fields: ['mime'] });
	const file: any = await joplin.data.get(['resources', id, 'file']);
	const body = file && file.body !== undefined ? file.body : file;
	let bytes: Uint8Array | null = null;
	if (body instanceof Uint8Array) bytes = body;
	else if (body && body.type === 'Buffer' && Array.isArray(body.data)) bytes = Uint8Array.from(body.data);
	else if (body instanceof ArrayBuffer) bytes = new Uint8Array(body);
	if (!bytes) throw new Error('No image data');
	return `data:${resource.mime};base64,${base64(bytes)}`;
}

async function boardFolderId() {
	const id = await findBoardNoteId();
	if (id) return (await joplin.data.get(['notes', id], { fields: ['parent_id'] })).parent_id;
	return (await allPages(['folders'], { fields: ['id'] }))[0]?.id || '';
}

// Errors travel back as { error } so the webview sees them the same way on desktop and mobile.
async function handleMessage(message: any) {
	try {
		return await answer(message);
	} catch (error) {
		console.warn('JotDrop:', message?.type, error);
		return { error: String((error as Error)?.message || error) };
	}
}

async function answer(message: any) {
	switch (message?.type) {
	case 'load': return loadBoard();
	case 'previews': return Promise.all(message.ids.map(preview));
	case 'search': return searchNotes(message.text);
	case 'open': await joplin.commands.execute('openNote', message.id); return true;
	case 'openUrl': await joplin.commands.execute('openItem', message.url); return true;
	case 'toggleTask': return toggleTask(message.id, message.line, !!message.checked);
	case 'setPinned':
		if (message.pinned) await joplin.data.userDataSet(ModelType.Note, message.id, 'pinned', true);
		else await joplin.data.userDataDelete(ModelType.Note, message.id, 'pinned');
		return cardFor(message.id);
	case 'setArchived':
		if (message.archived) await joplin.data.userDataSet(ModelType.Note, message.id, 'archived', true);
		else await joplin.data.userDataDelete(ModelType.Note, message.id, 'archived');
		return cardFor(message.id);
	case 'setRanks':
		for (const { id, rank } of message.ranks) await joplin.data.userDataSet(ModelType.Note, id, 'rank', Number(rank));
		return true;
	case 'setReminder': return setReminder(message.id, Number(message.due) || 0);
	case 'setColor':
		if (COLORS.has(message.color)) await joplin.data.userDataSet(ModelType.Note, message.id, 'color', message.color);
		else await joplin.data.userDataDelete(ModelType.Note, message.id, 'color');
		return cardFor(message.id);
	case 'create': {
		const note = await joplin.data.post(['notes'], null, {
			title: String(message.title || '').trim(),
			body: String(message.body || ''),
			parent_id: message.folderId || await boardFolderId(),
		});
		return cardFor(note.id);
	}
	case 'imageData': return imageData(message.id);
	case 'cloud': return openCloud(notifyBoards);
	}
	return null;
}

async function notifyBoards() {
	for (const view of views) {
		try {
			if (await joplin.views.editors.isVisible(view)) joplin.views.editors.postMessage(view, { type: 'changed' });
		} catch {
			// A closed window's view: nothing to tell.
		}
	}
}

// Joplin's change feed: edits in the editor, other windows and sync all show up here.
let cursor: string | null = null;
async function pollChanges() {
	if (!views.size) return;
	if (cursor === null) {
		cursor = String((await joplin.data.get(['events'])).cursor);
		return;
	}
	let changed = false;
	for (;;) {
		const result = await joplin.data.get(['events'], { cursor });
		cursor = String(result.cursor);
		if (result.items.length) changed = true;
		if (!result.has_more) break;
	}
	if (changed) await notifyBoards();
}

async function findBoardNoteId(): Promise<string | null> {
	const cached = String(await joplin.settings.value('boardNoteId') || '');
	if (cached) {
		try {
			const note = await joplin.data.get(['notes', cached], { fields: ['id', 'body', 'deleted_time'] });
			if (note && !note.deleted_time && isBoardBody(note.body)) return note.id;
		} catch {
			// Gone: look again below.
		}
	}
	// A board that came in through sync, or a setting that was lost.
	const found = (await allPages(['search'], { query: '"jotdrop-board"', type: 'note', fields: ['id', 'body'] })).find((note) => isBoardBody(note.body));
	await joplin.settings.setValue('boardNoteId', found ? found.id : '');
	return found ? found.id : null;
}

// The board and quick notes get a notebook of their own instead of whichever one happens to be selected.
async function boardFolderForNewBoard() {
	const folders = await allPages(['folders'], { fields: ['id', 'title', 'parent_id'] });
	const mine = folders.find((folder) => folder.title === BOARD_FOLDER && !folder.parent_id);
	return mine ? mine.id : (await joplin.data.post(['folders'], null, { title: BOARD_FOLDER })).id;
}

async function openBoard(create: boolean) {
	let id = await findBoardNoteId();
	if (!id) {
		if (!create) return;
		const note = await joplin.data.post(['notes'], null, { title: 'JotDrop', body: BOARD_BODY, parent_id: await boardFolderForNewBoard() });
		id = note.id as string;
		await joplin.data.userDataSet(ModelType.Note, id, 'board', true);
		await joplin.settings.setValue('boardNoteId', id);
	}
	await joplin.commands.execute('openNote', id);
	await delay(400);
	await joplin.commands.execute('showEditorPlugin');
}

joplin.plugins.register({
	onStart: async () => {
		platform = (await joplin.versionInfo()).platform;

		await joplin.settings.registerSection('jotdrop', { label: 'JotDrop', iconName: 'fas fa-th-large' });
		await joplin.settings.registerSettings({
			boardNoteId: { value: '', type: SettingItemType.String, section: 'jotdrop', public: false, label: 'Board note' },
			openAtStartup: { value: true, type: SettingItemType.Bool, section: 'jotdrop', public: true, label: 'Open the JotDrop board when Joplin starts' },
		});

		await joplin.views.editors.register(VIEW_ID, {
			onSetup: async (view) => {
				views.add(view);
				await joplin.views.editors.setHtml(view, '<div id="jotdrop-root"></div>');
				await joplin.views.editors.addScript(view, './board.css');
				await joplin.views.editors.addScript(view, './board.js');
				await joplin.views.editors.onMessage(view, handleMessage);
				await joplin.views.editors.onUpdate(view, async () => notifyBoards());
			},
			onActivationCheck: async ({ noteId }) => {
				try {
					return isBoardBody((await joplin.data.get(['notes', noteId], { fields: ['body'] })).body);
				} catch {
					return false;
				}
			},
		});

		await joplin.commands.register({
			name: 'jotdropOpenBoard',
			label: 'Open JotDrop board',
			iconName: 'fas fa-th-large',
			execute: async () => openBoard(true),
		});
		await joplin.views.toolbarButtons.create('jotdropOpenBoardButton', 'jotdropOpenBoard', ToolbarButtonLocation.EditorToolbar);

		if (platform === 'desktop') {
			await joplin.views.menuItems.create('jotdropOpenBoardMenu', 'jotdropOpenBoard', MenuItemLocation.View);
		} else {
			// On mobile a panel is reachable from every screen through the header's puzzle button.
			const panel = await joplin.views.panels.create('jotdropLauncher');
			await joplin.views.panels.setHtml(panel, '<div class="jd-launch"><div class="jd-launch-card"><h1>JotDrop</h1><p>All your notes as cards.</p><button id="jd-open" type="button">Open JotDrop board</button></div></div>');
			await joplin.views.panels.addScript(panel, './launcher.css');
			await joplin.views.panels.addScript(panel, './launcher.js');
			await joplin.views.panels.onMessage(panel, async (message: any) => {
				if (message?.type !== 'open') return;
				try { await joplin.commands.execute('dismissPluginPanels'); } catch { /* desktop has no such command */ }
				await openBoard(true);
			});
		}

		await joplin.workspace.onSyncComplete(async () => notifyBoards());
		setInterval(() => { pollChanges().catch(() => { cursor = null; }); }, 3000);
		if (platform === 'desktop') {
			await registerCloudSettings();
			startCloud(boardFolderForNewBoard, notifyBoards);
		}

		if (await joplin.settings.value('openAtStartup')) {
			setTimeout(() => { openBoard(false).catch(() => {}); }, 1500);
		}
	},
});
