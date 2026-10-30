import { noteUrls, previewLines, urlHost } from './note.js';
import { planMove, sortCards } from './order.js';

const PAGE = 60;
const COLOR_KEYS = ['default', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'gray'];
const STRINGS = {
  en: {
    search: 'Search your notes', allNotebooks: 'All notebooks', allTags: 'All', takeNote: 'Take a note…', title: 'Title',
    close: 'Close', savesTo: 'Saves to', pinned: 'Pinned', others: 'Others', pin: 'Pin', unpin: 'Unpin', color: 'Color',
    noNotes: 'No notes yet. Take your first note above.', noMatch: 'No notes match.', empty: 'Empty note',
    changed: 'This checklist changed in the meantime. The board shows the latest version again.', failed: 'That did not work. Please try again.',
    saved: 'Note saved', due: 'Due', overdue: 'Overdue', notes: (n) => (n === 1 ? '1 note' : `${n} notes`),
    archive: 'Archive', unarchive: 'Back to the board', archived: 'Note archived', unarchived: 'Note back on the board', archiveView: 'Archive', archiveEmpty: 'Nothing in the archive.',
    remind: 'Remind me', laterToday: 'Later today', tomorrow: 'Tomorrow', nextWeek: 'Next week', pickTime: 'Pick a date and time', setReminder: 'Set reminder', removeReminder: 'Remove reminder',
    colors: ['Default', 'Red', 'Orange', 'Yellow', 'Cream', 'Slate blue', 'Blue', 'Purple', 'Pink', 'Brown', 'Gray'],
  },
  nl: {
    search: 'Zoek in je notities', allNotebooks: 'Alle notitieboeken', allTags: 'Alles', takeNote: 'Maak een notitie…', title: 'Titel',
    close: 'Sluiten', savesTo: 'Komt in', pinned: 'Vastgezet', others: 'Overige', pin: 'Vastzetten', unpin: 'Losmaken', color: 'Kleur',
    noNotes: 'Nog geen notities. Maak hierboven je eerste notitie.', noMatch: 'Geen notities gevonden.', empty: 'Lege notitie',
    changed: 'Deze checklist is intussen veranderd. Het bord toont weer de nieuwste versie.', failed: 'Dat lukte niet. Probeer het nog eens.',
    saved: 'Notitie bewaard', due: 'Klaar op', overdue: 'Te laat', notes: (n) => (n === 1 ? '1 notitie' : `${n} notities`),
    archive: 'Archiveren', unarchive: 'Terug op het bord', archived: 'Notitie gearchiveerd', unarchived: 'Notitie staat weer op het bord', archiveView: 'Archief', archiveEmpty: 'Niets in het archief.',
    remind: 'Herinner me', laterToday: 'Later vandaag', tomorrow: 'Morgen', nextWeek: 'Volgende week', pickTime: 'Kies datum en tijd', setReminder: 'Herinnering zetten', removeReminder: 'Herinnering weghalen',
    colors: ['Standaard', 'Rood', 'Oranje', 'Geel', 'Crème', 'Leiblauw', 'Blauw', 'Paars', 'Roze', 'Bruin', 'Grijs'],
  },
};

let t = STRINGS.en;
let locale = 'en';
let els = null;
let openMenu = null;
let reloadTimer = 0;
let columnsShown = 0;
let lastData = '';
let renderToken = 0;
let searchToken = 0;
let searchTimer = 0;
let shown = 0;
let order = [];
let loadingMore = false;
let boxes = {};
let drag = null;
let dropCard = null;
let swallowClick = false;
const previews = new Map();
const state = { cards: [], folders: [], boardFolder: '', query: '', folderId: '', tag: '', archive: false, found: null };

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== '') el.append(child);
  return el;
}

function icon(path, filled = true) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', path);
  if (!filled) { p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.6'); }
  svg.append(p);
  return svg;
}
const PIN = 'M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z';
const PALETTE = 'M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z';
const BELL = 'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z';
const BOX = 'M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5L6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z';
const UNBOX = 'M20.55 5.22l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.15.55L3.46 5.22C3.17 5.57 3 6.01 3 6.5V19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.49-.17-.93-.45-1.28zM12 9.5l5.5 5.5H14v2h-4v-2H6.5L12 9.5zM5.12 5l.82-1h12l.93 1H5.12z';
const LINK = 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z';

async function post(message) {
  const result = await webviewApi.postMessage(message);
  if (result && typeof result === 'object' && result.error) throw new Error(result.error);
  return result;
}

function toast(text) {
  if (!els) return;
  els.toast.textContent = text;
  els.toast.classList.add('is-shown');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove('is-shown'), 3500);
}

function applyTheme() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--joplin-background-color').trim();
  let rgb = null;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
  if (hex) {
    const v = hex[1].length === 3 ? hex[1].replace(/./g, '$&$&') : hex[1];
    rgb = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  } else {
    const m = /rgba?\(([^)]+)\)/.exec(raw);
    if (m) rgb = m[1].split(',').slice(0, 3).map((n) => parseFloat(n));
  }
  if (rgb) document.documentElement.dataset.theme = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] < 128 ? 'dark' : 'light';
}

// ---- data ----

function scheduleReload(wait = 250) {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(load, wait);
}

async function load() {
  // A drag or an open menu is never pulled from under the user: look again a little later.
  if (drag || openMenu) return scheduleReload(1000);
  let data;
  try {
    data = await post({ type: 'load' });
  } catch {
    toast(t.failed);
    return;
  }
  if (!els) {
    t = STRINGS[String(data.locale).slice(0, 2)] || STRINGS.en;
    locale = String(data.locale).replace('_', '-');
    document.documentElement.dataset.platform = data.platform;
    buildShell();
  }
  applyTheme();
  // Nothing changed for the board (our own write coming back, a note it does not show): cards stay put.
  const same = JSON.stringify([data.cards, data.folders, data.boardFolder]);
  if (same === lastData) return;
  lastData = same;
  Object.assign(state, { cards: data.cards, folders: data.folders, boardFolder: data.boardFolder });
  if (state.query.trim()) runSearch();
  renderAll(false);
}

async function ensurePreviews(cards) {
  const missing = cards.filter((c) => (previews.get(c.id) || {}).updated !== c.updated).map((c) => c.id);
  for (let i = 0; i < missing.length; i += PAGE) {
    for (const shownCard of await post({ type: 'previews', ids: missing.slice(i, i + PAGE) })) previews.set(shownCard.id, shownCard);
  }
}

async function update(message, done) {
  try {
    replaceCard(await post(message));
    if (done) toast(done);
  } catch (error) {
    toast(String(error && error.message).includes('changed') ? t.changed : t.failed);
    await load();
  }
}

function replaceCard(card) {
  previews.set(card.id, card.preview);
  const i = state.cards.findIndex((c) => c.id === card.id);
  if (i < 0) return;
  const moved = state.cards[i].pinned !== card.pinned || state.cards[i].archived !== card.archived;
  state.cards[i] = card;
  if (moved) return renderAll(false);
  // A tick or a colour keeps the card in its place (Eric, 26 Oct: cards stay put).
  const old = els.grid.querySelector(`[data-id="${card.id}"]`);
  if (old) old.replaceWith(cardEl(card));
}

// ---- filters ----

function descendants(id) {
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of state.folders) if (ids.has(f.parent_id) && !ids.has(f.id)) { ids.add(f.id); grew = true; }
  }
  return ids;
}

function inFolder() {
  const here = state.cards.filter((c) => c.archived === state.archive);
  if (!state.folderId) return here;
  const ids = descendants(state.folderId);
  return here.filter((c) => ids.has(c.folderId));
}

function visibleCards() {
  const q = state.query.trim().toLowerCase();
  return inFolder().filter((c) => (!state.tag || c.tags.includes(state.tag))
    && (!q || (state.found && state.found.has(c.id)) || `${c.title}\n${(previews.get(c.id) || {}).body || ''}\n${c.tags.join(' ')}`.toLowerCase().includes(q)));
}

// Title, tags and fetched text match at once; Joplin's index adds the notes the board has not fetched.
function runSearch() {
  const token = ++searchToken;
  clearTimeout(searchTimer);
  const text = state.query;
  if (!text.trim()) {
    state.found = null;
    return renderGrid(true);
  }
  renderGrid(true);
  searchTimer = setTimeout(async () => {
    let ids = [];
    try { ids = await post({ type: 'search', text }); } catch { /* the local match above still stands */ }
    if (token !== searchToken) return;
    state.found = new Set(ids);
    renderGrid(true);
  }, 200);
}

function folderName(id) {
  return (state.folders.find((f) => f.id === id) || {}).title || '';
}

// ---- shell ----

function buildShell() {
  const search = h('input', { type: 'search', class: 'jd-search', placeholder: t.search, 'aria-label': t.search,
    oninput: (e) => { state.query = e.target.value; state.found = null; runSearch(); } });
  const folder = h('select', { class: 'jd-folder', 'aria-label': t.allNotebooks,
    onchange: (e) => { state.folderId = e.target.value; state.tag = ''; renderAll(true); } });
  const archive = h('button', { type: 'button', class: 'jd-chip jd-archive', 'aria-pressed': 'false',
    onclick: () => { state.archive = !state.archive; state.tag = ''; renderAll(true); } });
  const count = h('p', { class: 'jd-count' });
  const tags = h('div', { class: 'jd-tags' });
  const grid = h('div', { class: 'jd-grid' });
  const more = h('div', { class: 'jd-more', 'aria-hidden': 'true' });
  const toastEl = h('div', { class: 'jd-toast', role: 'status', 'aria-live': 'polite' });
  els = { search, folder, archive, count, tags, grid, more, toast: toastEl };
  const top = h('header', { class: 'jd-top' },
    h('div', { class: 'jd-brand' }, h('span', { class: 'jd-word', text: 'JotDrop' }), count),
    h('div', { class: 'jd-filters' }, search, folder, archive));
  document.getElementById('jotdrop-root').replaceChildren(top, tags, buildComposer(), grid, more, toastEl);
  new ResizeObserver(() => { if (columnCount() !== columnsShown) renderGrid(); }).observe(grid);
  new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) loadMore(); }, { rootMargin: '800px' }).observe(more);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  document.addEventListener('click', closeMenu);
  setupDrag();
}

function buildComposer() {
  const title = h('input', { class: 'jd-c-title', placeholder: t.title, 'aria-label': t.title });
  const body = h('textarea', { class: 'jd-c-body', placeholder: t.takeNote, 'aria-label': t.takeNote, rows: 1 });
  const where = h('span', { class: 'jd-c-where' });
  const save = h('button', { type: 'submit', class: 'jd-c-save', text: t.close });
  const form = h('form', { class: 'jd-compose' }, title, body, h('div', { class: 'jd-c-bar' }, where, save));
  const close = () => { form.classList.remove('is-open'); body.rows = 1; if (form.contains(document.activeElement)) document.activeElement.blur(); };
  const submit = async () => {
    if (!title.value.trim() && !body.value.trim()) return close();
    save.disabled = true;
    try {
      const card = await post({ type: 'create', title: title.value, body: body.value, folderId: state.folderId });
      previews.set(card.id, card.preview);
      state.cards.unshift(card);
      title.value = '';
      body.value = '';
      close();
      renderAll(true);
      toast(t.saved);
    } catch {
      toast(t.failed);
    } finally {
      save.disabled = false;
    }
  };
  form.addEventListener('focusin', () => {
    form.classList.add('is-open');
    body.rows = 3;
    where.textContent = `${t.savesTo}: ${folderName(state.folderId || state.boardFolder)}`;
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
    if (e.key === 'Escape') close();
  });
  return form;
}

// ---- render ----

function renderAll(fromTop) {
  renderFolders();
  renderTags();
  renderArchiveButton();
  renderGrid(fromTop);
}

function renderArchiveButton() {
  const n = state.cards.filter((c) => c.archived).length;
  els.archive.setAttribute('aria-pressed', String(state.archive));
  els.archive.textContent = `${state.archive ? '✓ ' : ''}${t.archiveView}${n ? ` (${n})` : ''}`;
}

function renderFolders() {
  const options = [h('option', { value: '', text: t.allNotebooks })];
  const walk = (parent, depth) => {
    for (const f of state.folders.filter((x) => (x.parent_id || '') === parent).sort((a, b) => a.title.localeCompare(b.title))) {
      options.push(h('option', { value: f.id, text: `${'  '.repeat(depth)}${f.title}` }));
      walk(f.id, depth + 1);
    }
  };
  walk('', 0);
  els.folder.replaceChildren(...options);
  els.folder.value = state.folderId;
}

function renderTags() {
  const counts = new Map();
  for (const c of inFolder()) for (const tag of c.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
  const names = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([name]) => name);
  if (state.tag && !names.includes(state.tag)) names.push(state.tag);
  // The chosen chip carries a ✓ as well as its colour (colour-blind safe).
  const chip = (label, value) => {
    const on = state.tag === value;
    return h('button', { type: 'button', class: 'jd-chip', 'aria-pressed': String(on), onclick: () => { state.tag = value; renderAll(true); } }, on ? '✓ ' : '', label);
  };
  els.tags.replaceChildren(...(names.length ? [chip(t.allTags, ''), ...names.map((n) => chip(`#${n}`, n))] : []));
}

function columnCount() {
  const width = els.grid.clientWidth || window.innerWidth;
  const min = width < 600 ? 150 : 230;
  return Math.max(1, Math.min(6, Math.floor((width + 12) / (min + 12))));
}

// Only the cards near the screen exist: more are fetched and added while scrolling. A re-render keeps as many as
// were showing, so the page does not jump; `fromTop` is for a new filter or search.
async function renderGrid(fromTop) {
  const token = ++renderToken;
  const cards = visibleCards();
  const pinned = sortCards(cards.filter((c) => c.pinned));
  const others = sortCards(cards.filter((c) => !c.pinned));
  const all = [...pinned, ...others];
  els.count.textContent = t.notes(cards.length);
  const count = fromTop ? Math.min(PAGE, all.length) : Math.min(Math.max(PAGE, shown), all.length);
  try {
    await ensurePreviews(all.slice(0, count));
  } catch {
    toast(t.failed);
    return;
  }
  if (token !== renderToken) return;
  const scroller = document.scrollingElement || document.documentElement;
  const y = scroller.scrollTop;
  columnsShown = columnCount();
  const box = () => {
    const el = h('div', { class: 'jd-cols' });
    el.append(...Array.from({ length: columnsShown }, () => h('div', { class: 'jd-col' })));
    return el;
  };
  boxes = { pinned: box(), others: box() };
  const parts = [];
  if (pinned.length) parts.push(h('h2', { class: 'jd-section', text: t.pinned }), boxes.pinned);
  if (pinned.length && others.length) parts.push(h('h2', { class: 'jd-section', text: t.others }));
  if (others.length) parts.push(boxes.others);
  if (!cards.length) parts.push(h('p', { class: 'jd-empty', text: state.archive ? t.archiveEmpty : (state.cards.length ? t.noMatch : t.noNotes) }));
  els.grid.replaceChildren(...parts);
  order = all;
  shown = 0;
  place(count);
  scroller.scrollTop = fromTop ? 0 : y;
  loadMore();
}

// Keep-style stacking: every card goes to the shortest column, so newest stays near the top.
function place(count) {
  for (const card of order.slice(shown, shown + count)) {
    const cols = [...(card.pinned ? boxes.pinned : boxes.others).children];
    let best = cols[0];
    for (const col of cols) if (col.offsetHeight < best.offsetHeight) best = col;
    best.append(cardEl(card));
  }
  shown += count;
}

async function loadMore() {
  if (loadingMore || shown >= order.length) return;
  if (els.more.getBoundingClientRect().top > window.innerHeight + 800) return;
  loadingMore = true;
  const token = renderToken;
  try {
    await ensurePreviews(order.slice(shown, shown + PAGE));
    if (token === renderToken) place(Math.min(PAGE, order.length - shown));
  } catch {
    toast(t.failed);
    return;
  } finally {
    loadingMore = false;
  }
  loadMore();
}

function cardEl(c) {
  const shownNote = previews.get(c.id) || { body: '', image: null };
  const lines = previewLines(shownNote.body, c.title);
  // One chip per site: three links to the same site would show three identical chips.
  const hosts = new Set();
  const urls = noteUrls(shownNote.body).filter((url) => !hosts.has(urlHost(url)) && hosts.add(urlHost(url))).slice(0, 3);
  const card = h('article', { class: `note-card note-${c.color}${c.pinned ? ' is-pinned' : ''}`, tabindex: 0, 'data-id': c.id, 'aria-label': c.title || t.empty },
    h('span', { class: 'card-paper', 'aria-hidden': 'true' }),
    h('span', { class: 'card-tape', 'aria-hidden': 'true' }));
  card.style.setProperty('--tilt', tiltFor(c.id));
  if (shownNote.image) card.append(cover(shownNote.image));
  if (c.title) card.append(h('h3', { text: c.title }));
  if (lines.length) {
    card.append(h('div', { class: 'note-preview' }, lines.map((line) => (line.line === undefined
      ? h('div', { class: 'jd-line', text: line.text || ' ' })
      : task(c, line)))));
  }
  if (!c.title && !lines.length && !shownNote.image) card.append(h('p', { class: 'jd-muted', text: t.empty }));
  if (c.isTodo && c.due) card.append(dueBadge(c));
  const chips = [
    ...c.tags.map((tag) => h('span', { class: 'jd-tagchip', text: `#${tag}` })),
    ...urls.map((url) => h('a', { class: 'link-chip', href: url, title: url,
      onclick: (e) => { e.preventDefault(); e.stopPropagation(); post({ type: 'openUrl', url }).catch(() => toast(t.failed)); } }, icon(LINK), urlHost(url))),
  ];
  if (chips.length) card.append(h('div', { class: 'jd-chips' }, chips));
  card.append(
    h('button', { type: 'button', class: 'card-pin', 'aria-pressed': String(c.pinned), title: c.pinned ? t.unpin : t.pin, 'aria-label': c.pinned ? t.unpin : t.pin,
      onclick: (e) => { e.stopPropagation(); update({ type: 'setPinned', id: c.id, pinned: !c.pinned }); } }, icon(PIN, c.pinned)),
    h('div', { class: 'card-actions' }, colorButton(c), reminderButton(c), archiveButton(c)));
  card.addEventListener('click', (e) => {
    if (swallowClick || e.target.closest('button, a, input, .card-menu')) return;
    post({ type: 'open', id: c.id }).catch(() => toast(t.failed));
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target === card) post({ type: 'open', id: c.id }).catch(() => toast(t.failed));
  });
  return card;
}

// Only the paper turns a little, never the text (Eric's rule from the website); the same note always gets the same angle.
function tiltFor(id) {
  let n = 0;
  for (const ch of id) n = (n * 31 + ch.charCodeAt(0)) % 997;
  return `${((n % 13) - 6) / 10}deg`;
}

function task(c, line) {
  // ☐/☑ are shapes, not colours, so the state is clear without colour vision.
  return h('div', { class: `jd-task${line.checked ? ' is-done' : ''}` },
    h('button', { type: 'button', class: 'jd-check', role: 'checkbox', 'aria-checked': String(line.checked), 'aria-label': line.text,
      text: line.checked ? '☑' : '☐', onclick: (e) => { e.stopPropagation(); update({ type: 'toggleTask', id: c.id, line: line.line, checked: !line.checked }); } }),
    h('span', { text: line.text }));
}

function dueBadge(c) {
  const overdue = !c.done && c.due < Date.now();
  let when = '';
  try { when = new Date(c.due).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }); } catch { when = new Date(c.due).toLocaleString(); }
  return h('p', { class: `card-reminder${overdue ? ' is-overdue' : ''}`, text: `${overdue ? `⚠ ${t.overdue}` : `⏰ ${t.due}`} ${when}` });
}

function cover(image) {
  const img = h('img', { class: 'card-cover', alt: '', loading: 'lazy', src: image.url });
  img.addEventListener('error', async () => {
    if (img.dataset.fallback) return img.remove();
    img.dataset.fallback = '1';
    try { img.src = await post({ type: 'imageData', id: image.id }); } catch { img.remove(); }
  });
  return img;
}

function colorButton(c) {
  const button = h('button', { type: 'button', class: 'jd-act', title: t.color, 'aria-label': t.color, 'aria-haspopup': 'menu',
    onclick: (e) => { e.stopPropagation(); showColors(button, c); } }, icon(PALETTE));
  return button;
}

function archiveButton(c) {
  const label = c.archived ? t.unarchive : t.archive;
  return h('button', { type: 'button', class: 'jd-act', title: label, 'aria-label': label,
    onclick: (e) => { e.stopPropagation(); update({ type: 'setArchived', id: c.id, archived: !c.archived }, c.archived ? t.unarchived : t.archived); } }, icon(c.archived ? UNBOX : BOX));
}

function reminderButton(c) {
  const button = h('button', { type: 'button', class: 'jd-act', title: t.remind, 'aria-label': t.remind, 'aria-haspopup': 'menu',
    onclick: (e) => { e.stopPropagation(); showReminders(button, c); } }, icon(BELL));
  return button;
}

function at(days, hour) {
  const when = new Date();
  when.setDate(when.getDate() + days);
  when.setHours(hour, 0, 0, 0);
  return when;
}

function showReminders(anchor, c) {
  closeMenu();
  const menu = h('div', { class: 'card-menu', role: 'menu' });
  const set = (due) => { closeMenu(); update({ type: 'setReminder', id: c.id, due }); };
  const choice = (label, when) => {
    let hint = '';
    try { hint = when.toLocaleString(locale, { weekday: 'short', hour: '2-digit', minute: '2-digit' }); } catch { hint = when.toLocaleString(); }
    menu.append(h('button', { type: 'button', role: 'menuitem', onclick: () => set(when.getTime()) }, label, h('span', { class: 'menu-hint', text: hint })));
  };
  const evening = at(0, 18);
  if (evening.getTime() > Date.now()) choice(t.laterToday, evening);
  choice(t.tomorrow, at(1, 9));
  choice(t.nextWeek, at(((8 - new Date().getDay()) % 7) || 7, 9));
  const pad = (n) => String(n).padStart(2, '0');
  const start = c.due ? new Date(c.due) : at(1, 9);
  const input = h('input', { type: 'datetime-local', class: 'menu-time', 'aria-label': t.pickTime,
    value: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}` });
  menu.append(h('label', { class: 'menu-pick' }, t.pickTime, input),
    h('button', { type: 'button', role: 'menuitem', class: 'menu-set', onclick: () => { const when = new Date(input.value).getTime(); if (when) set(when); } }, t.setReminder));
  if (c.due) menu.append(h('button', { type: 'button', role: 'menuitem', onclick: () => set(0) }, t.removeReminder));
  showMenu(menu, anchor);
}

function showMenu(menu, anchor) {
  menu.addEventListener('click', (e) => e.stopPropagation());
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8))}px`;
  const below = r.bottom + 4;
  menu.style.top = `${below + menu.offsetHeight > window.innerHeight ? Math.max(8, r.top - menu.offsetHeight - 4) : below}px`;
  openMenu = menu;
}

function showColors(anchor, c) {
  closeMenu();
  const menu = h('div', { class: 'card-menu', role: 'menu' });
  COLOR_KEYS.forEach((key, i) => {
    const on = c.color === key;
    menu.append(h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(on),
      onclick: (e) => { e.stopPropagation(); closeMenu(); if (!on) update({ type: 'setColor', id: c.id, color: key }); } },
    h('span', { class: `swatch note-${key}`, 'aria-hidden': 'true' }), t.colors[i], on ? h('span', { class: 'menu-check', text: '✓' }) : null));
  });
  showMenu(menu, anchor);
}

function closeMenu() {
  if (openMenu) openMenu.remove();
  openMenu = null;
}

// ---- dragging ----

// One code path for mouse and finger. A mouse drag starts after a small move; a finger first holds still for a
// moment, because a finger that moves straight away is scrolling. The dragged card fades and a bar shows where
// it lands, so nothing shifts until the drop.
function setupDrag() {
  const HOLD_MS = 350;
  const NOISE = 8;
  let pending = null;

  const cancelPending = () => {
    if (pending) clearTimeout(pending.timer);
    pending = null;
  };
  const begin = (from) => {
    const group = from.card.pinned ? 'pinned' : 'others';
    drag = { id: from.card.id, group, el: from.el, x: from.x, y: from.y, target: null, after: false, frame: 0 };
    from.el.classList.add('is-dragging');
    document.documentElement.classList.add('is-card-dragging');
    drag.frame = requestAnimationFrame(autoScroll);
  };
  const finish = (drop) => {
    if (!drag) return;
    const { id, group, el, target, after, frame } = drag;
    cancelAnimationFrame(frame);
    el.classList.remove('is-dragging');
    document.documentElement.classList.remove('is-card-dragging');
    showDrop(null);
    drag = null;
    // The click that ends a drag must not open the note.
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 50);
    if (drop && target) moveCard(id, group, target, after);
  };

  els.grid.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('.note-card');
    if (!el || e.button !== 0 || !e.isPrimary || e.target.closest('button, a, input, select, textarea')) return;
    const card = state.cards.find((c) => c.id === el.dataset.id);
    if (!card) return;
    cancelPending();
    pending = { el, card, x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse', timer: 0 };
    if (pending.touch) pending.timer = setTimeout(() => { const from = pending; pending = null; if (from) begin(from); }, HOLD_MS);
  });
  document.addEventListener('pointermove', (e) => {
    if (pending) {
      if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) < NOISE) return;
      if (pending.touch) return cancelPending();
      const from = pending;
      pending = null;
      begin(from);
    }
    if (!drag) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    aim();
  });
  document.addEventListener('pointerup', () => { cancelPending(); finish(true); });
  document.addEventListener('pointercancel', () => { cancelPending(); finish(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') finish(false); });
  // Once a finger drag runs, the page must not scroll along or show its long-press menu.
  document.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', (e) => { if (pending || drag) e.preventDefault(); });
  document.addEventListener('dragstart', (e) => { if (e.target.closest && e.target.closest('.note-card')) e.preventDefault(); });
}

function aim() {
  const box = boxes[drag.group];
  const hit = document.elementFromPoint(drag.x, drag.y);
  let target = hit && hit.closest ? hit.closest('.note-card') : null;
  if (target && !box.contains(target)) target = null;
  if (!target) {
    // Between cards or under a short column: the nearest card of the column under the pointer.
    const col = [...box.children].find((c) => { const r = c.getBoundingClientRect(); return drag.x >= r.left - 8 && drag.x <= r.right + 8 && drag.y >= r.top - 40 && drag.y <= box.getBoundingClientRect().bottom + 40; });
    let best = Infinity;
    for (const el of col ? col.children : []) {
      const r = el.getBoundingClientRect();
      const distance = Math.abs(drag.y - (r.top + r.bottom) / 2);
      if (distance < best) { best = distance; target = el; }
    }
  }
  if (!target || target === drag.el) {
    drag.target = null;
    return showDrop(null);
  }
  const r = target.getBoundingClientRect();
  drag.target = target.dataset.id;
  drag.after = drag.y > r.top + r.height / 2;
  showDrop(target, drag.after);
}

function showDrop(el, after) {
  if (dropCard) dropCard.classList.remove('drop-before', 'drop-after');
  dropCard = el || null;
  if (el) el.classList.add(after ? 'drop-after' : 'drop-before');
}

function autoScroll() {
  if (!drag) return;
  const edge = 70;
  const scroller = document.scrollingElement || document.documentElement;
  const push = drag.y < edge ? drag.y - edge : drag.y > window.innerHeight - edge ? drag.y - (window.innerHeight - edge) : 0;
  if (push) {
    scroller.scrollTop += push / 5;
    aim();
    loadMore();
  }
  drag.frame = requestAnimationFrame(autoScroll);
}

// Counts the notes a search or filter hides too, so clearing it never reshuffles them.
async function moveCard(id, group, targetId, after) {
  const pinned = group === 'pinned';
  const list = sortCards(state.cards.filter((c) => c.archived === state.archive && c.pinned === pinned));
  const ranks = planMove(list, id, targetId, after);
  if (!ranks.length) return;
  for (const { id: changed, rank } of ranks) state.cards.find((c) => c.id === changed).rank = rank;
  renderGrid();
  try {
    await post({ type: 'setRanks', ranks });
  } catch {
    toast(t.failed);
    lastData = '';
    await load();
  }
}

// ---- start ----

function start() {
  if (!document.getElementById('jotdrop-root') || typeof webviewApi === 'undefined') {
    setTimeout(start, 30);
    return;
  }
  // Joplin adds (and swaps) its theme after the page loads: on desktop as a <link> that loads later,
  // on mobile as a <style> in <body>. Look again when either appears and when a stylesheet finishes loading.
  applyTheme();
  const themeWatch = new MutationObserver(applyTheme);
  themeWatch.observe(document.head, { childList: true, subtree: true, characterData: true });
  themeWatch.observe(document.body, { childList: true });
  document.addEventListener('load', applyTheme, true);
  webviewApi.onMessage((event) => {
    const message = event && event.message !== undefined ? event.message : event;
    if (message && message.type === 'changed') scheduleReload();
  });
  load();
}

start();
