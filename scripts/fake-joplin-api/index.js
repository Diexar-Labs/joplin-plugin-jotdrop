// A small Joplin for the Ask JotDrop test (test/ai.test.mjs): notes, tags and settings in memory, only the parts of
// the plugin API that src/ai.ts uses. The test reaches the same state through globalThis.__joplin.
// One state, also when the test build and the test itself each load this file.
// resources: attachments by id, { id, title, mime, file_extension, size, bytes }; the test hands out bytes itself.
const state = globalThis.__joplin ??= { notes: new Map(), tags: new Map(), links: new Set(), resources: new Map(), settings: {}, posted: [], onPost: null, clock: 1000 };

const page = (items, query = {}) => {
  const limit = query.limit ?? 100, n = query.page ?? 1;
  return { items: items.slice((n - 1) * limit, n * limit), has_more: items.length > n * limit };
};
const pick = (row, fields) => (fields ? Object.fromEntries(fields.map((field) => [field, row[field]])) : { ...row });
const note = (id) => { const found = state.notes.get(id); if (!found) throw new Error(`no note ${id}`); return found; };
const touch = (row) => { row.updated_time = ++state.clock; };

// Joplin's "any:1 word* word*": a note matches when a word of it starts with one of the terms. Deleted notes and
// conflicts come back too, so the plugin's own filter is what keeps them out.
function search(query) {
  const terms = String(query).replace(/^any:1\s+/, '').split(/\s+/).map((term) => term.replace(/\*$/, '').toLowerCase()).filter(Boolean);
  return [...state.notes.values()].filter((row) => terms.some((term) => new RegExp(`(^|[^\\p{L}\\p{N}])${term}`, 'iu').test(`${row.title}\n${row.body}`)));
}

const tagsOf = (id) => [...state.tags.values()].filter((tag) => state.links.has(`${tag.id}/${id}`));

const joplin = {
  // "desktop" unless a test sets globalThis.__joplin.platform = 'mobile' before registerAiSettings().
  async versionInfo() { return { platform: state.platform || 'desktop', version: '3.7.10' }; },
  settings: {
    async registerSettings(spec) { for (const [key, item] of Object.entries(spec)) if (!(key in state.settings)) state.settings[key] = item.value; },
    async value(key) { return state.settings[key]; },
    async setValue(key, value) { state.settings[key] = value; },
    async globalValue(key) { return key === 'locale' ? 'nl_NL' : undefined; },
  },
  data: {
    async get(path, query = {}) {
      const [kind, id, sub] = path;
      if (kind === 'search') return page(search(query.query).map((row) => pick(row, query.fields)), query);
      if (kind === 'notes' && sub === 'tags') return page(tagsOf(id).map((tag) => pick(tag, query.fields)), query);
      if (kind === 'notes') return pick(note(id), query.fields);
      if (kind === 'tags' && sub === 'notes') return page([...state.notes.values()].filter((row) => state.links.has(`${id}/${row.id}`)).map((row) => pick(row, query.fields)), query);
      if (kind === 'tags') return page([...state.tags.values()].map((tag) => pick(tag, query.fields)), query);
      if (kind === 'resources') { const found = state.resources.get(id); if (!found) throw new Error(`no resource ${id}`); return pick(found, query.fields); }
      throw new Error(`get ${path.join('/')}`);
    },
    async post(path, _query, body) {
      const [kind, id, sub] = path;
      if (kind === 'notes') {
        const row = { id: `new${state.notes.size + 1}`, title: '', body: '', parent_id: '', user_data: '', is_conflict: 0, deleted_time: 0, encryption_applied: 0, todo_due: 0, ...body };
        touch(row);
        state.notes.set(row.id, row);
        return row;
      }
      if (kind === 'tags' && sub === 'notes') { state.links.add(`${id}/${body.id}`); return {}; }
      if (kind === 'tags') { const tag = { id: `tag${state.tags.size + 1}`, title: body.title }; state.tags.set(tag.id, tag); return tag; }
      throw new Error(`post ${path.join('/')}`);
    },
    async put(path, _query, body) {
      const row = note(path[1]);
      Object.assign(row, body);
      touch(row);
      return row;
    },
    async delete(path) {
      const [kind, id, sub, noteId] = path;
      if (kind === 'tags' && sub === 'notes') { state.links.delete(`${id}/${noteId}`); return; }
      throw new Error(`delete ${path.join('/')}`);
    },
    async userDataSet(_type, id, key, value) {
      const row = note(id);
      const all = JSON.parse(row.user_data || '{}');
      all['net.jotdrop.joplin'] = { ...(all['net.jotdrop.joplin'] || {}), [key]: { v: value, t: state.clock, d: 0 } };
      row.user_data = JSON.stringify(all);
      touch(row);
    },
  },
  views: {
    editors: {
      postMessage(view, message) {
        state.posted.push({ view, message: JSON.parse(JSON.stringify(message)) });
        state.onPost?.(message);
      },
    },
  },
};

export default joplin;
