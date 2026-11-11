import joplin from 'api';
import { ModelType, SettingItemType } from 'api/types';
import { runAssistant } from './cloud-shared/ai/assistant.mjs';
import { AiError, PROVIDERS, createProvider, pickDefaultModel } from './cloud-shared/ai/providers.mjs';
import { selectNotes, words } from './cloud-shared/ai/context.mjs';
import { foldUnchanged } from './cloud-shared/diff.mjs';
import { appendedText, describeChange, modelGroups } from './cloud-shared/ai-web.mjs';
import { DEFAULT_WARN, PAPER_DRAWER, drawerLabel, validExpires } from './cloud-shared/paper.mjs';
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
	colors: Set<string>;
};

const POOL = 200;
const NOTE_FIELDS = ['id', 'title', 'body', 'updated_time', 'user_data', 'is_conflict', 'deleted_time', 'encryption_applied'];

// "This computer" on desktop, "this phone" on Joplin for Android, in the words of an error.
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

	async function ask(message: any, view: string) {
		const config = await loadConfig();
		const request = String(message.request || '').trim();
		if (!request) throw new Error('Type a request first.');
		const noteId = message.noteId ? String(message.noteId) : '';
		const summarize = message.mode === 'summarize' && noteId;
		const excluded = new Set<string>((message.excluded || []).map(String));
		const pinned = noteId ? [noteId] : [];
		const notes = (await pool(request, pinned, summarize ? noteId : undefined)).filter((note) => !excluded.has(note.id));
		const labels = await withLabels(notes);
		const first = new Set(pick(notes, request, pinned, config.includeShared).map((note) => note.id));
		const seen = new Map(notes.map((note) => [note.id, note.updated]));
		const titles = new Map(notes.map((note) => [note.id, note.title]));
		const opened: { id?: string } = {};
		const token = String(message.token || ++asks);
		const run = { controller: new AbortController(), waiting: new Map<string, (yes: boolean) => void>() };
		runs.set(token, run);
		let report: any;
		try {
			report = await runAssistant({
				request, notes, labels, pinned, includeShared: config.includeShared,
				settings: { language: language(String(await joplin.settings.globalValue('locale') || 'en')), date: today(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
				config: { provider: config.provider, key: config.key, model: config.model, baseUrl: config.baseUrl },
				// After Stop no new round goes out (the shared loop only passes on a stop that comes while a round runs).
				fetcher: (url: string, init?: RequestInit) => run.controller.signal.aborted ? Promise.reject(new DOMException('Stopped.', 'AbortError')) : fetcher(url, init),
				executor: executor(seen, opened), confirm: confirmOn(view, token, run), signal: run.controller.signal,
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
			usage: report.usage,
			service: config.provider === 'custom' ? config.baseUrl : service?.name || '',
			model: config.model || service?.defaultModel || '',
			local: onThisComputer(config),
			open: opened.id || '',
		};
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
