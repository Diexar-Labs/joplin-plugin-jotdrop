import joplin from 'api';
import { ModelType, SettingItemType } from 'api/types';
import { FILE_TIMEOUT_MS, runAssistant } from './cloud-shared/ai/assistant.mjs';
import { AiError, PROVIDERS, TRANSCRIBE_MODEL, createProvider, pickDefaultModel } from './cloud-shared/ai/providers.mjs';
import { selectNotes, words } from './cloud-shared/ai/context.mjs';
import { LIMITS, MIMES, capabilities, decodedLength, explain } from './cloud-shared/ai/parts.mjs';
import { parseReceipt, receiptRequest } from './cloud-shared/ai/receipt.mjs';
import { foldUnchanged } from './cloud-shared/diff.mjs';
import { PHOTO_SYSTEM, aiFileKind, appendedText, describeChange, fileRequest, modelGroups, plainBase64 } from './cloud-shared/ai-web.mjs';
import { DEFAULT_WARN, PAPER_DRAWER, SUGGESTED_DRAWERS, drawerLabel, drawerName, isPaperDrawer, validExpires } from './cloud-shared/paper.mjs';
import { bytesToBase64 } from './cloud-shared/crypto.mjs';
import { isDrawingName } from './cloud-shared/drawing.mjs';
import { resourceLinks } from './fileChips.mjs';
import manifest from './manifest.json';

// Ask JotDrop in Joplin desktop and Joplin for Android: AI with the user's own key (Hand-off/ontwerp-ai-eigen-sleutel.md,
// phase 5). The shared assistant runs here, in the plugin's main process, and talks straight to the AI service the user
// chose; never through a JotDrop server. The key is a secure setting and never goes to the board's webview. On desktop
// that is the system keychain when there is one; Joplin for Android 3.7 keeps it in Joplin's own database inside the
// app (measured 11 Nov 2026), and the window says so. On Android the plugin's fetch sends `Origin: null`, so a service
// must allow CORS; the four big ones do. The board only shows: it sends the request, shows what goes along, asks the user to
// confirm a change, and shows the answer.
//
// Which notes: Joplin's own full-text index finds the notes with words of the request (like the board's search), at
// most POOL of them; the shared code then picks what goes along, at most 20 notes and 30,000 characters. Not the
// board note, not the trash, no conflicts or notes Joplin could not decrypt. A note with a live list link is
// "shared" and stays home unless the user allows it.
//
// Version 2 (Hand-off/ontwerp-ask-jotdrop-v2.md, phase 5): the photos, PDFs and recordings a note links to (Joplin
// resources) can go along when the user ticks them, and three fixed actions on a card send one of them with no notes
// and no tools: write out a recording, read a photo, read a receipt for the Paper drawer. The bytes are read here,
// with resourceBytes, and never travel through the board. Joplin's main process has no canvas, so a photo goes as it
// is: JPEG, PNG, WebP or GIF up to 4 MiB; anything else gets a message. Joplin for Android cannot read the bytes for a
// plugin, so there files show with that reason and the card menu has no file actions.

export const AI_PROVIDER_IDS = ['ollama', 'anthropic', 'openai', 'gemini', 'openrouter', 'custom'];
type Config = { provider: string; key: string; model: string; baseUrl: string; includeShared: boolean };
const OFF: Config = { provider: '', key: '', model: '', baseUrl: '', includeShared: false };
type AiNote = { id: string; title: string; text: string; labels: string[]; updatedAt: string; shared: boolean; updated: number };

export type AskHelpers = {
	allPages: (path: string[], query?: Record<string, unknown>) => Promise<any[]>;
	isBoard: (note: any) => boolean;
	boardFolderId: () => Promise<string>;
	setReminder: (id: string, due: number) => Promise<unknown>;
	setPaper: (id: string, drawer: string, expires: string, warn: string) => Promise<unknown>;
	tagId: (title: string) => Promise<string>;
	hasListLink: (id: string) => boolean;
	notifyBoards: () => Promise<void>;
	resourceBytes: (id: string) => Promise<Uint8Array>;
	colors: Set<string>;
};

type FileKind = 'image' | 'pdf' | 'audio';
/** A file of a note that can go along: a resource the note links to; bytes is its size as Joplin knows it. */
type AiFile = { id: string; name: string; kind: FileKind; mime: string; bytes: number };
/** The fixed actions on a card, with the kinds of file each one takes. */
export const FILE_ACTIONS: Record<string, FileKind[]> = { transcribe: ['audio'], photo: ['image'], receipt: ['image', 'pdf'] };
const isAction = (value: unknown) => typeof value === 'string' && Object.prototype.hasOwnProperty.call(FILE_ACTIONS, value);
const RESOURCE_FIELDS = ['id', 'title', 'mime', 'file_extension', 'size'];

/** The kind and type of a resource that can go along, or null: a drawing waits (decision 4), other files stay home. */
export function aiFileOf(resource: { title?: string; mime?: string; file_extension?: string }): { kind: FileKind; mime: string } | null {
	const title = String(resource.title || '');
	if (isDrawingName(title)) return null;
	const byName = aiFileKind(title) || (resource.file_extension ? aiFileKind(`file.${resource.file_extension}`) : null);
	const mime = String(resource.mime || '').toLowerCase();
	const kind: FileKind | '' = byName?.kind || (mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'audio' : mime === 'application/pdf' ? 'pdf' : '');
	if (!kind) return null;
	return { kind, mime: MIMES[kind].includes(mime) ? mime : byName?.mime || mime };
}

// Per resource: the kind of file it is for the card's menu, or null. Not kept: a resource that could not be read yet.
const kindCache = new Map<string, FileKind | null>();

/** The kinds of file a note links to that can go along: enough to choose the card's menu items. */
export async function aiFileKinds(body: string): Promise<FileKind[]> {
	const kinds = new Set<FileKind>();
	if (here === 'this phone') return [];
	for (const { id } of resourceLinks(body)) {
		if (!kindCache.has(id)) {
			try { kindCache.set(id, aiFileOf(await joplin.data.get(['resources', id], { fields: RESOURCE_FIELDS }))?.kind || null); } catch { continue; }
		}
		const kind = kindCache.get(id);
		if (kind) kinds.add(kind);
	}
	return [...kinds];
}

/** The files of a note that can go along, once each, in the note's own order. A link to a note is left out. */
async function noteFiles(noteId: string): Promise<AiFile[]> {
	const note = await joplin.data.get(['notes', noteId], { fields: ['body'] });
	const files: AiFile[] = [];
	for (const { id, text } of resourceLinks(String(note.body || ''))) {
		if (files.some((file) => file.id === id)) continue;
		let resource: any;
		try { resource = await joplin.data.get(['resources', id], { fields: RESOURCE_FIELDS }); } catch { continue; }
		const type = resource && aiFileOf(resource);
		if (type) files.push({ id, name: String(resource.title || text || `file.${resource.file_extension || 'bin'}`), ...type, bytes: Number(resource.size) || 0 });
	}
	return files;
}

const WORDS: Record<FileKind, string> = { image: 'photo', pdf: 'PDF', audio: 'recording' };

/** Why a file cannot go with this service, in words, or ''. Checked before anything is read. */
function fileProblem(file: AiFile, config: Config, action: string): string {
	// Joplin for Android 3.7 gives a plugin no way to read an attachment's bytes ("Unsupported encoding: buffer",
	// measured on the emulator 12 Nov 2026), so there the card menu has no file actions and a file says why.
	if (here === 'this phone') return 'Joplin for Android does not let JotDrop read attached files. Use Joplin on your computer for this.';
	const use = action === 'transcribe' ? 'transcribe' : 'ask';
	const caps = capabilities(config.provider, { id: config.model || PROVIDERS[config.provider]?.defaultModel || '' });
	if (caps[file.kind === 'audio' && use === 'transcribe' ? 'transcribe' : file.kind] === false) return explain(config.provider, file.kind, use);
	if (!MIMES[file.kind].includes(file.mime)) return file.kind === 'image' ? 'Joplin sends JPEG, PNG, WebP and GIF photos only.' : `This type of ${WORDS[file.kind]} cannot go along.`;
	if (file.bytes > LIMITS[file.kind]) return `Larger than ${Math.round(LIMITS[file.kind] / 1048576)} MiB, too large to send.`;
	return '';
}

const POOL = 200;
const NOTE_FIELDS = ['id', 'title', 'body', 'updated_time', 'user_data', 'is_conflict', 'deleted_time', 'encryption_applied'];

// "This computer" on desktop, "this phone" on Joplin for Android, in the words of an error; also how this file tells
// that it runs on Android.
let here = 'this computer';

export async function registerAiSettings() {
	here = (await joplin.versionInfo()).platform === 'mobile' ? 'this phone' : 'this computer';
	await joplin.settings.registerSettings({
		aiProvider: { value: '', type: SettingItemType.String, section: 'jotdrop', public: false, label: 'Ask JotDrop: AI service' },
		aiKey: { value: '', type: SettingItemType.String, section: 'jotdrop', public: false, secure: true, label: 'Ask JotDrop: API key' },
		aiModel: { value: '', type: SettingItemType.String, section: 'jotdrop', public: false, label: 'Ask JotDrop: model' },
		aiBaseUrl: { value: '', type: SettingItemType.String, section: 'jotdrop', public: false, label: 'Ask JotDrop: own address' },
		aiIncludeShared: { value: false, type: SettingItemType.Bool, section: 'jotdrop', public: false, label: 'Ask JotDrop: also notes with a live list link' },
	});
}

/** The stored settings, cleaned: a known service, a key only where one is used, an address only for an own address. */
function cleaned(value: Record<string, unknown>): Config {
	const provider = AI_PROVIDER_IDS.includes(String(value.provider)) ? String(value.provider) : '';
	if (!provider) return { ...OFF };
	const keeps = PROVIDERS[provider].needsKey || provider === 'custom';
	return {
		provider,
		key: keeps ? String(value.key ?? '').trim() : '',
		model: String(value.model ?? '').trim(),
		baseUrl: provider === 'custom' ? String(value.baseUrl ?? '').trim() : '',
		includeShared: Boolean(value.includeShared),
	};
}

async function loadConfig(): Promise<Config> {
	const [provider, key, model, baseUrl, includeShared] = await Promise.all(['aiProvider', 'aiKey', 'aiModel', 'aiBaseUrl', 'aiIncludeShared'].map((name) => joplin.settings.value(name)));
	return cleaned({ provider, key, model, baseUrl, includeShared });
}

/** What the settings form says now; an empty key field keeps the saved key of the same service. */
async function formConfig(message: any): Promise<Config> {
	const saved = await loadConfig();
	const provider = String(message.provider || '');
	return cleaned({ ...message, key: String(message.key || '').trim() || (provider === saved.provider ? saved.key : '') });
}

/** Ollama, or an own address on this computer (LM Studio and the like): the request stays on this computer. */
const onThisComputer = (config: Config) => config.provider === 'ollama' || (config.provider === 'custom' && /^http:\/\/(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:|\/|$)/i.test(config.baseUrl));

/** The service's words come along, with every key in them hidden by the shared core. */
function errorText(error: any, provider: string): string {
	if (error instanceof AiError || (error && typeof error === 'object' && 'code' in error && 'detail' in error)) {
		// Joplin desktop's plugin process sends no Origin header, so a local service needs no CORS setting there; on
		// Android it sends `Origin: null` and the service must allow that (both measured 11 Nov 2026).
		const hint = error.code !== 'network' ? '' : provider === 'ollama' ? ` Is Ollama running on ${here}, at http://127.0.0.1:11434?` : provider === 'custom' ? ' Is the service running at this address?' : '';
		return `${error.message}${error.detail ? ` The service said: ${error.detail}` : ''}${hint}`;
	}
	return error instanceof Error ? error.message : 'Something went wrong. Try again.';
}

function language(locale: string): string {
	const code = String(locale || 'en').replace('_', '-');
	try {
		return new Intl.DisplayNames(['en'], { type: 'language' }).of(code.split('-')[0]) || code;
	} catch {
		return code;
	}
}

function today(now = new Date()): string {
	return `${now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

const oneLine = (text: unknown) => String(text ?? '').replace(/[\r\n]+/g, ' ').trim();
// The fetch of the plugin's own process, straight to the service.
const fetcher = (url: string, init?: RequestInit) => fetch(url, init);

export function setupAsk(helpers: AskHelpers) {
	const runs = new Map<string, { controller: AbortController; waiting: Map<string, (yes: boolean) => void> }>();
	let asks = 0;

	const usable = (note: any) => note && !note.is_conflict && !Number(note.deleted_time) && !note.encryption_applied && !helpers.isBoard(note);

	const asAiNote = (note: any): AiNote => ({
		id: note.id,
		title: String(note.title || ''),
		text: String(note.body || ''),
		labels: [],
		updatedAt: new Date(Number(note.updated_time) || 0).toISOString(),
		shared: helpers.hasListLink(note.id),
		updated: Number(note.updated_time) || 0,
	});

	// The notes with words of the request, from Joplin's index (a word counts from its start, as in the shared code),
	// and the notes the user pinned.
	async function pool(request: string, pinned: string[], only?: string): Promise<AiNote[]> {
		const found = new Map<string, any>();
		const terms = only ? [] : words(request);
		if (terms.length) {
			const query = `any:1 ${terms.map((term: string) => `${term}*`).join(' ')}`;
			for (let page = 1; found.size < POOL; page++) {
				const result = await joplin.data.get(['search'], { query, type: 'note', fields: NOTE_FIELDS, page, limit: 100 });
				for (const note of result.items || []) if (found.size < POOL) found.set(note.id, note);
				if (!result.has_more) break;
			}
		}
		for (const id of only ? [only] : pinned) {
			if (found.has(id)) continue;
			try { found.set(id, await joplin.data.get(['notes', id], { fields: NOTE_FIELDS })); } catch { /* gone */ }
		}
		return [...found.values()].filter(usable).map(asAiNote);
	}

	async function withLabels(notes: AiNote[]): Promise<string[]> {
		const tags = await helpers.allPages(['tags'], { fields: ['id', 'title'] });
		const byId = new Map(notes.map((note) => [note.id, note]));
		for (const tag of tags) {
			for (const note of await helpers.allPages(['tags', tag.id, 'notes'], { fields: ['id'] })) byId.get(note.id)?.labels.push(tag.title);
		}
		return tags.map((tag) => String(tag.title)).sort((a, b) => a.localeCompare(b));
	}

	function pick(notes: AiNote[], request: string, pinned: string[], includeShared: boolean) {
		return selectNotes(notes, request, { includeShared, pinned }).notes as Array<{ id: string; title: string; truncated: boolean }>;
	}

	// The tools that change notes, through Joplin's data API, so a change is an ordinary edit that Joplin syncs.
	// `seen` holds the version of each note the AI saw: a note that changed meanwhile is left alone.
	function executor(seen: Map<string, number>, opened: { id?: string }) {
		const fresh = async (id: string) => {
			const note = await joplin.data.get(['notes', id], { fields: ['id', 'title', 'body', 'updated_time', 'deleted_time', 'todo_due'] });
			if (!note || Number(note.deleted_time)) throw new Error('This note is in the trash now, so it was left as it is.');
			if (seen.has(id) && seen.get(id) !== Number(note.updated_time)) throw new Error('This note changed while Ask JotDrop worked, so it was left as it is.');
			return note;
		};
		const done = async (id: string) => {
			seen.set(id, Number((await joplin.data.get(['notes', id], { fields: ['updated_time'] })).updated_time));
			return 'Done.';
		};
		return {
			async create_note(input: { title: string; text?: string; items?: string[]; color?: string; label?: string }) {
				const body = (String(input.text ?? '').trim() || input.items?.length) ? appendedText('', { text: input.text, items: input.items }) : '';
				const note = await joplin.data.post(['notes'], null, { title: oneLine(input.title), body, parent_id: await helpers.boardFolderId() });
				if (input.color && helpers.colors.has(input.color)) await joplin.data.userDataSet(ModelType.Note, note.id, 'color', input.color);
				if (input.label) await joplin.data.post(['tags', await helpers.tagId(String(input.label).toLowerCase()), 'notes'], null, { id: note.id });
				await done(note.id);
				return { id: note.id, title: oneLine(input.title) };
			},
			async append_to_note(input: { id: string; text?: string; items?: string[] }) {
				const note = await fresh(input.id);
				await joplin.data.put(['notes', input.id], null, { body: appendedText(String(note.body || ''), input) });
				return done(input.id);
			},
			// The new text replaces the body; the title stays, and a first heading that repeats it is dropped.
			async replace_note_text(input: { id: string; text: string }) {
				const note = await fresh(input.id);
				let text = String(input.text).replace(/\r\n/g, '\n').trim();
				const heading = /^#[ \t]+(.*?)[ \t]*(?:\n|$)/.exec(text);
				if (heading && heading[1].trim().toLowerCase() === String(note.title || '').trim().toLowerCase()) text = text.slice(heading[0].length).trim();
				await joplin.data.put(['notes', input.id], null, { body: text ? `${text}\n` : '' });
				return done(input.id);
			},
			// Labels are Joplin tags, which Joplin keeps in lower case.
			async set_labels(input: { id: string; labels: string[] }) {
				await fresh(input.id);
				const want = [...new Set(input.labels.map((label) => oneLine(label).toLowerCase()).filter(Boolean))];
				const current = await helpers.allPages(['notes', input.id, 'tags'], { fields: ['id', 'title'] });
				for (const tag of current) if (!want.includes(tag.title)) await joplin.data.delete(['tags', tag.id, 'notes', input.id]);
				for (const title of want) if (!current.some((tag) => tag.title === title)) await joplin.data.post(['tags', await helpers.tagId(title), 'notes'], null, { id: input.id });
				return done(input.id);
			},
			// Joplin's own to-do alarm, as the board's reminder menu sets it.
			async set_reminder(input: { id: string; at: string }) {
				await fresh(input.id);
				const due = new Date(input.at).getTime();
				if (!Number.isFinite(due)) throw new Error('That is not a valid date and time.');
				await helpers.setReminder(input.id, due);
				return done(input.id);
			},
			// The Paper drawer (or one of its drawers) with the expiry date; a note without a reminder gets the usual warning.
			async set_expiry(input: { id: string; date: string; drawer?: string }) {
				const note = await fresh(input.id);
				const day = validExpires(input.date);
				if (!day) throw new Error('That is not a valid date.');
				const drawer = (input.drawer ? drawerLabel(oneLine(input.drawer).replace(/\//g, ' ')) : PAPER_DRAWER).toLowerCase();
				await helpers.setPaper(input.id, drawer, day, Number(note.todo_due) ? '' : DEFAULT_WARN);
				return done(input.id);
			},
			async open_note(input: { id: string }) {
				opened.id = input.id;
				return 'The note opens for the user after this answer.';
			},
		};
	}

	function confirmOn(view: string, token: string, run: { controller: AbortController; waiting: Map<string, (yes: boolean) => void> }) {
		let n = 0;
		return (change: any) => new Promise<boolean>((resolve) => {
			if (run.controller.signal.aborted) return resolve(false);
			const id = `${token}:${++n}`;
			run.waiting.set(id, resolve);
			const shown = describeChange(change);
			joplin.views.editors.postMessage(view, { type: 'aiConfirm', token, id, heading: shown.heading, lines: shown.lines ? foldUnchanged(shown.lines) : null, facts: shown.facts || null });
		});
	}

	// The files the board asks to send: only files of this note that can go, each read here. A shared note's files
	// stay home like the note itself.
	async function chosenFiles(config: Config, noteId: string, ids: string[], action: string): Promise<AiFile[]> {
		if (!ids.length) return [];
		if (!noteId) throw new Error('A file goes along only from a note.');
		if (helpers.hasListLink(noteId) && !config.includeShared) throw new Error('This note has a live list link. Ask JotDrop keeps those notes and their files out.');
		const files = (await noteFiles(noteId)).filter((file) => ids.includes(file.id) && (!action || FILE_ACTIONS[action].includes(file.kind)));
		if (files.length !== new Set(ids).size) throw new Error('That file is no longer in this note.');
		for (const file of files) {
			const problem = fileProblem(file, config, action);
			if (problem) throw new Error(`${file.name}: ${problem}`);
		}
		return files;
	}

	async function readPart(file: AiFile) {
		let bytes: Uint8Array;
		try { bytes = await helpers.resourceBytes(file.id); } catch { throw new Error(`${file.name} is not on ${here} yet. Let Joplin finish syncing, then try again.`); }
		if (bytes.length > LIMITS[file.kind]) throw new Error(`${file.name} is larger than ${Math.round(LIMITS[file.kind] / 1048576)} MiB.`);
		return { kind: file.kind, mime: file.mime, name: file.name, data: plainBase64(bytesToBase64(bytes)) };
	}

	// Writing out a recording, reading a photo and reading a receipt are one request each, without tools or notes,
	// with the longer AI time of files. The result takes the form of the assistant's report.
	async function once(config: Config, action: string, parts: any[], locale: string, signal: AbortSignal) {
		const report: any = { answer: '', sent: [], sources: [], actions: [], files: parts.map((part) => ({ name: part.name, kind: part.kind, bytes: decodedLength(part.data) })), rounds: 1, usage: { input: 0, output: 0 }, stop: 'done' };
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(new DOMException('The AI service took too long.', 'TimeoutError')), FILE_TIMEOUT_MS);
		const passOn = () => controller.abort(signal.reason);
		signal.addEventListener('abort', passOn, { once: true });
		try {
			const ai = createProvider({ provider: config.provider, key: config.key, model: config.model, baseUrl: config.baseUrl }, fetcher);
			let answer: any;
			if (action === 'transcribe') answer = await ai.transcribe({ audio: parts[0], language: locale, signal: controller.signal });
			else if (action === 'receipt') {
				const { system, text } = receiptRequest(language(locale));
				answer = await ai.complete({ system, messages: [{ role: 'user', text, parts }], tools: [], signal: controller.signal });
			} else answer = await ai.complete({ system: PHOTO_SYSTEM, messages: [{ role: 'user', text: fileRequest('photo'), parts }], tools: [], signal: controller.signal });
			report.answer = answer.text ?? '';
			report.usage = { input: answer.usage?.input ?? 0, output: answer.usage?.output ?? 0, ...(answer.usage?.seconds ? { seconds: answer.usage.seconds } : {}) };
			if (answer.stop === 'refusal') report.stop = 'refusal';
		} catch (error: any) {
			const known = error instanceof AiError ? error as any : new AiError('bad_response', String(error?.message ?? '')) as any;
			// JotDrop's own check stops a file before anything goes out.
			if (!known.status && ['unsupported_input', 'too_large', 'bad_request'].includes(known.code)) report.rounds = 0;
			report.stop = known.code === 'timeout' || known.code === 'cancelled' ? known.code : known.code === 'refusal' ? 'refusal' : ['no_key', 'no_model', 'no_provider', 'bad_address'].includes(known.code) ? 'off' : 'error';
			if (report.stop !== 'refusal') report.error = { code: known.code, message: known.message, detail: known.detail };
		} finally {
			clearTimeout(timer);
			signal.removeEventListener('abort', passOn);
		}
		return report;
	}

	async function ask(message: any, view: string) {
		const config = await loadConfig();
		const request = String(message.request || '').trim();
		if (!request) throw new Error('Type a request first.');
		const noteId = message.noteId ? String(message.noteId) : '';
		const action = noteId && isAction(message.action) ? String(message.action) : '';
		const summarize = !action && message.mode === 'summarize' && noteId;
		const files = await chosenFiles(config, noteId, summarize ? [] : (message.files || []).map(String), action);
		if (action && files.length !== 1) throw new Error('Choose a file first.');
		const excluded = new Set<string>((message.excluded || []).map(String));
		const pinned = noteId ? [noteId] : [];
		// A file action sends the file only: no notes, no labels.
		const notes = action ? [] : (await pool(request, pinned, summarize ? noteId : undefined)).filter((note) => !excluded.has(note.id));
		const labels = action ? [] : await withLabels(notes);
		const first = new Set(pick(notes, request, pinned, config.includeShared).map((note) => note.id));
		const seen = new Map(notes.map((note) => [note.id, note.updated]));
		const titles = new Map(notes.map((note) => [note.id, note.title]));
		const opened: { id?: string } = {};
		const token = String(message.token || ++asks);
		const run = { controller: new AbortController(), waiting: new Map<string, (yes: boolean) => void>() };
		runs.set(token, run);
		const locale = String(await joplin.settings.globalValue('locale') || 'en');
		// The note as it is now: the receipt screen changes it only when nothing changed meanwhile.
		const updated = action === 'receipt' ? Number((await joplin.data.get(['notes', noteId], { fields: ['updated_time'] })).updated_time) : 0;
		let report: any;
		try {
			const parts: any[] = [];
			for (const file of files) parts.push(await readPart(file));
			if (run.controller.signal.aborted) throw new DOMException('Stopped.', 'AbortError');
			report = action ? await once(config, action, parts, locale, run.controller.signal) : await runAssistant({
				request, notes, labels, pinned, includeShared: config.includeShared,
				settings: { language: language(locale), date: today(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
				config: { provider: config.provider, key: config.key, model: config.model, baseUrl: config.baseUrl },
				// After Stop no new round goes out (the shared loop only passes on a stop that comes while a round runs).
				fetcher: (url: string, init?: RequestInit) => run.controller.signal.aborted ? Promise.reject(new DOMException('Stopped.', 'AbortError')) : fetcher(url, init),
				executor: executor(seen, opened), confirm: confirmOn(view, token, run), signal: run.controller.signal, parts,
			});
		} finally {
			runs.delete(token);
			for (const resolve of run.waiting.values()) resolve(false);
			await helpers.notifyBoards();
		}
		const stops: Record<string, string> = {
			refusal: 'The AI service declined to answer this.',
			max_rounds: 'Ask JotDrop stopped after 6 rounds, so the AI cannot run up your bill. Try a shorter request.',
		};
		const service = PROVIDERS[config.provider];
		for (const action of report.actions) if (action.tool === 'create_note' && action.result?.id) titles.set(action.result.id, action.result.title);
		return {
			stop: report.stop,
			failed: Boolean(report.error),
			problem: report.error ? errorText(report.error, config.provider) : stops[report.stop] || '',
			answer: report.answer,
			sources: report.sources.map((note: any) => ({ id: note.id, title: note.title })),
			actions: report.actions.filter((action: any) => !['search_notes', 'read_note'].includes(action.tool)).map((action: any) => ({
				tool: action.tool, status: action.status, reason: action.reason || '',
				title: action.tool === 'create_note' ? oneLine(action.input?.title) || 'a note' : titles.get(action.input?.id) || 'a note',
				made: action.tool === 'create_note' && action.status === 'done' ? action.result?.id || '' : '',
			})),
			first: first.size,
			also: report.sent.filter((note: any) => !first.has(note.id)).map((note: any) => note.title),
			files: report.files || [],
			// Nothing went out when JotDrop's own check stopped a file first.
			nothingSent: Boolean(report.error) && report.rounds === 0,
			usage: report.usage,
			service: config.provider === 'custom' ? config.baseUrl : service?.name || '',
			// OpenAI writes out a recording with its own model.
			model: action === 'transcribe' && config.provider === 'openai' ? TRANSCRIBE_MODEL : config.model || service?.defaultModel || '',
			local: onThisComputer(config),
			open: opened.id || '',
			receipt: action === 'receipt' && report.stop === 'done' ? parseReceipt(report.answer) : null,
			updated,
		};
	}

	/** The note's files for the window, without their bytes, with why one cannot go; for a receipt also the drawers. */
	async function filesShown(message: any) {
		const config = await loadConfig();
		const noteId = String(message.noteId || '');
		const action = isAction(message.action) ? String(message.action) : '';
		// The fixed request of an action, as it goes out, for the window to show.
		const request = action === 'receipt' ? receiptRequest(language(String(await joplin.settings.globalValue('locale') || 'en'))).text : action ? fileRequest(action) : '';
		if (!noteId || (helpers.hasListLink(noteId) && !config.includeShared)) return { files: [], drawers: [], drawer: '', request };
		const files = (await noteFiles(noteId)).filter((file) => !action || FILE_ACTIONS[action].includes(file.kind))
			.map((file) => ({ id: file.id, name: file.name, kind: file.kind, bytes: file.bytes, problem: fileProblem(file, config, action) }));
		if (action !== 'receipt') return { files, drawers: [], drawer: '', request };
		// Joplin keeps tags in lower case: a suggested drawer that is already there in lower case shows once.
		const tags = (await helpers.allPages(['tags'], { fields: ['title'] })).map((tag) => String(tag.title));
		const own = tags.filter((title) => isPaperDrawer(title)).map(drawerName).filter(Boolean);
		const drawers = [...own, ...SUGGESTED_DRAWERS.filter((name) => !own.includes(name.toLowerCase()))];
		const current = (await helpers.allPages(['notes', noteId, 'tags'], { fields: ['title'] })).map((tag) => drawerName(tag.title)).find(Boolean) || '';
		return { files, drawers, drawer: current, request };
	}

	// "Receipt to Paper drawer" after Apply, with the same code as the tools: the new title (empty keeps the old), the
	// lines below the note (as append_to_note), then the drawer, the expiry date and its warning (as set_expiry). A
	// note changed since the AI read the receipt is left alone; a bad date changes nothing.
	async function applyReceipt(message: any) {
		const id = String(message.id || '');
		const note = await joplin.data.get(['notes', id], { fields: ['id', 'body', 'updated_time', 'deleted_time', 'todo_due'] });
		if (!note || Number(note.deleted_time)) throw new Error('This note is in the trash now, so it was left as it is.');
		if (Number(note.updated_time) !== Number(message.updated)) throw new Error('This note changed while Ask JotDrop worked, so it was left as it is.');
		const day = validExpires(String(message.expires || ''));
		if (!day) throw new Error('Choose how long to keep it, or fill in a date.');
		const title = oneLine(message.title);
		const lines = String(message.lines ?? '').trim();
		if (title || lines) await joplin.data.put(['notes', id], null, { ...(title ? { title } : {}), ...(lines ? { body: appendedText(String(note.body || ''), { text: lines }) } : {}) });
		const name = oneLine(message.drawer).replace(/\//g, ' ').trim();
		await helpers.setPaper(id, (name ? drawerLabel(name) : PAPER_DRAWER).toLowerCase(), day, Number(note.todo_due) ? '' : DEFAULT_WARN);
		await helpers.notifyBoards();
		return { expires: day };
	}

	/** The settings without the key: the board only learns whether one is saved. */
	async function settingsShown() {
		const config = await loadConfig();
		return {
			provider: config.provider, model: config.model, baseUrl: config.baseUrl, includeShared: config.includeShared, hasKey: Boolean(config.key), version: manifest.version,
			providers: AI_PROVIDER_IDS.map((id) => ({ id, name: PROVIDERS[id].name, needsKey: PROVIDERS[id].needsKey, defaultModel: PROVIDERS[id].defaultModel })),
		};
	}

	async function save(message: any) {
		const next = await formConfig(message);
		if (next.provider && PROVIDERS[next.provider].needsKey && !next.key) throw new Error('Paste your API key first.');
		if (next.provider === 'custom' && !next.baseUrl) throw new Error('Fill in the address of the service first.');
		await joplin.settings.setValue('aiProvider', next.provider);
		await joplin.settings.setValue('aiKey', next.key);
		await joplin.settings.setValue('aiModel', next.model);
		await joplin.settings.setValue('aiBaseUrl', next.baseUrl);
		await joplin.settings.setValue('aiIncludeShared', next.includeShared);
		return settingsShown();
	}

	async function remove() {
		for (const name of ['aiProvider', 'aiKey', 'aiModel', 'aiBaseUrl']) await joplin.settings.setValue(name, '');
		await joplin.settings.setValue('aiIncludeShared', false);
		return settingsShown();
	}

	// Asking for the model list checks key and connection; no note goes along.
	async function models(message: any) {
		const config = await formConfig(message);
		const list = await createProvider({ ...config, model: config.model || 'any' }, fetcher).listModels({ signal: AbortSignal.timeout(20000) });
		const preferred = pickDefaultModel(config.provider, list);
		const groups = modelGroups(config.provider, list, preferred).map((group: any) => ({ label: group.label, models: group.models.map((m: any) => ({ id: m.id, name: m.name, tools: m.tools })) }));
		return { count: list.length, preferred, groups, tools: Object.fromEntries(list.map((m: any) => [m.id, m.tools])) };
	}

	/** Messages from the board whose type starts with "ai". */
	return async function answerAi(message: any, view: string) {
		try {
			switch (message.type) {
			case 'aiSettings': return await settingsShown();
			case 'aiSave': return await save(message);
			case 'aiRemove': return await remove();
			case 'aiModels': return await models(message);
			case 'aiPreview': {
				const config = await loadConfig();
				const noteId = message.noteId ? String(message.noteId) : '';
				const excluded = new Set<string>((message.excluded || []).map(String));
				const pinned = noteId ? [noteId] : [];
				const notes = (await pool(String(message.request || ''), pinned, message.mode === 'summarize' && noteId ? noteId : undefined)).filter((note) => !excluded.has(note.id));
				return { notes: pick(notes, String(message.request || ''), pinned, config.includeShared).map(({ id, title, truncated }) => ({ id, title, truncated })) };
			}
			case 'aiAsk': return await ask(message, view);
			case 'aiFiles': return await filesShown(message);
			case 'aiReceipt': return await applyReceipt(message);
			case 'aiConfirmAnswer': {
				for (const run of runs.values()) {
					const resolve = run.waiting.get(String(message.id));
					if (resolve) { run.waiting.delete(String(message.id)); resolve(Boolean(message.yes)); }
				}
				return true;
			}
			case 'aiStop': {
				const run = runs.get(String(message.token));
				if (run) {
					run.controller.abort(new DOMException('Stopped.', 'AbortError'));
					for (const resolve of run.waiting.values()) resolve(false);
					run.waiting.clear();
				}
				return true;
			}
			case 'aiAddBelow': {
				const note = await joplin.data.get(['notes', String(message.id)], { fields: ['body', 'deleted_time'] });
				if (!note || Number(note.deleted_time)) throw new Error('This note is gone.');
				await joplin.data.put(['notes', String(message.id)], null, { body: appendedText(String(note.body || ''), { text: String(message.text || '') }) });
				await helpers.notifyBoards();
				return true;
			}
			}
			return null;
		} catch (error) {
			return { error: errorText(error, String(message.provider || (await loadConfig()).provider)) };
		}
	};
}
