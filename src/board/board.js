import { noteUrls, previewLines, urlHost } from './note.js';

const COLOR_KEYS = ['default', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'gray'];
const STRINGS = {
  en: {
    search: 'Search your notes', allNotebooks: 'All notebooks', allTags: 'All', takeNote: 'Take a note…', title: 'Title',
    close: 'Close', savesTo: 'Saves to', pinned: 'Pinned', others: 'Others', pin: 'Pin', unpin: 'Unpin', color: 'Color',
    noNotes: 'No notes yet. Take your first note above.', noMatch: 'No notes match.', empty: 'Empty note',
    changed: 'This checklist changed in the meantime. The board shows the latest version again.', failed: 'That did not work. Please try again.',
    saved: 'Note saved', due: 'Due', overdue: 'Overdue', notes: (n) => (n === 1 ? '1 note' : `${n} notes`),
    colors: ['Default', 'Red', 'Orange', 'Yellow', 'Cream', 'Slate blue', 'Blue', 'Purple', 'Pink', 'Brown', 'Gray'],
  },
  nl: {
    search: 'Zoek in je notities', allNotebooks: 'Alle notitieboeken', allTags: 'Alles', takeNote: 'Maak een notitie…', title: 'Titel',
    close: 'Sluiten', savesTo: 'Komt in', pinned: 'Vastgezet', others: 'Overige', pin: 'Vastzetten', unpin: 'Losmaken', color: 'Kleur',
    noNotes: 'Nog geen notities. Maak hierboven je eerste notitie.', noMatch: 'Geen notities gevonden.', empty: 'Lege notitie',
    changed: 'Deze checklist is intussen veranderd. Het bord toont weer de nieuwste versie.', failed: 'Dat lukte niet. Probeer het nog eens.',
    saved: 'Notitie bewaard', due: 'Klaar op', overdue: 'Te laat', notes: (n) => (n === 1 ? '1 notitie' : `${n} notities`),
    colors: ['Standaard', 'Rood', 'Oranje', 'Geel', 'Crème', 'Leiblauw', 'Blauw', 'Paars', 'Roze', 'Bruin', 'Grijs'],
  },
};

let t = STRINGS.en;
let locale = 'en';
let els = null;
let openMenu = null;
let reloadTimer = 0;
let columnsShown = 0;
const state = { cards: [], folders: [], boardFolder: '', query: '', folderId: '', tag: '' };

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

function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(load, 250);
}

async function load() {
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
  Object.assign(state, { cards: data.cards, folders: data.folders, boardFolder: data.boardFolder });
  applyTheme();
  closeMenu();
  renderAll();
}

async function update(message) {
  try {
    replaceCard(await post(message));
  } catch (error) {
    toast(String(error && error.message).includes('changed') ? t.changed : t.failed);
    await load();
  }
}

function replaceCard(card) {
  const i = state.cards.findIndex((c) => c.id === card.id);
  if (i < 0) return;
  const moved = state.cards[i].pinned !== card.pinned;
  state.cards[i] = card;
  if (moved) return renderGrid();
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
  if (!state.folderId) return state.cards;
  const ids = descendants(state.folderId);
  return state.cards.filter((c) => ids.has(c.folderId));
}

function visibleCards() {
  const q = state.query.trim().toLowerCase();
  return inFolder().filter((c) => (!state.tag || c.tags.includes(state.tag))
    && (!q || `${c.title}\n${c.body}\n${c.tags.join(' ')}`.toLowerCase().includes(q)));
}

function folderName(id) {
  return (state.folders.find((f) => f.id === id) || {}).title || '';
}

// ---- shell ----

function buildShell() {
  const search = h('input', { type: 'search', class: 'jd-search', placeholder: t.search, 'aria-label': t.search,
    oninput: (e) => { state.query = e.target.value; renderGrid(); } });
  const folder = h('select', { class: 'jd-folder', 'aria-label': t.allNotebooks,
    onchange: (e) => { state.folderId = e.target.value; state.tag = ''; renderAll(); } });
  const count = h('p', { class: 'jd-count' });
  const tags = h('div', { class: 'jd-tags' });
  const grid = h('div', { class: 'jd-grid' });
  const toastEl = h('div', { class: 'jd-toast', role: 'status', 'aria-live': 'polite' });
  els = { search, folder, count, tags, grid, toast: toastEl };
  const top = h('header', { class: 'jd-top' },
    h('div', { class: 'jd-brand' }, h('span', { class: 'jd-word', text: 'JotDrop' }), count),
    h('div', { class: 'jd-filters' }, search, folder));
  document.getElementById('jotdrop-root').replaceChildren(top, tags, buildComposer(), grid, toastEl);
  new ResizeObserver(() => { if (columnCount() !== columnsShown) renderGrid(); }).observe(grid);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
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
      state.cards.unshift(card);
      title.value = '';
      body.value = '';
      close();
      renderAll();
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

function renderAll() {
  renderFolders();
  renderTags();
  renderGrid();
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
    return h('button', { type: 'button', class: 'jd-chip', 'aria-pressed': String(on), onclick: () => { state.tag = value; renderAll(); } }, on ? '✓ ' : '', label);
  };
  els.tags.replaceChildren(...(names.length ? [chip(t.allTags, ''), ...names.map((n) => chip(`#${n}`, n))] : []));
}

function columnCount() {
  const width = els.grid.clientWidth || window.innerWidth;
  const min = width < 600 ? 150 : 230;
  return Math.max(1, Math.min(6, Math.floor((width + 12) / (min + 12))));
}

function renderGrid() {
  const scroller = document.scrollingElement || document.documentElement;
  const y = scroller.scrollTop;
  const cards = visibleCards();
  const pinned = cards.filter((c) => c.pinned);
  const others = cards.filter((c) => !c.pinned);
  els.count.textContent = t.notes(cards.length);
  const boxes = [];
  const parts = [];
  if (pinned.length) parts.push(h('h2', { class: 'jd-section', text: t.pinned }), box(pinned));
  if (pinned.length && others.length) parts.push(h('h2', { class: 'jd-section', text: t.others }));
  if (others.length) parts.push(box(others));
  if (!cards.length) parts.push(h('p', { class: 'jd-empty', text: state.cards.length ? t.noMatch : t.noNotes }));
  els.grid.replaceChildren(...parts);
  columnsShown = columnCount();
  // Keep-style stacking: every card goes to the shortest column, so newest stays near the top.
  for (const b of boxes) {
    const cols = Array.from({ length: columnsShown }, () => h('div', { class: 'jd-col' }));
    b.el.replaceChildren(...cols);
    for (const card of b.cards) {
      let best = cols[0];
      for (const col of cols) if (col.offsetHeight < best.offsetHeight) best = col;
      best.append(cardEl(card));
    }
  }
  scroller.scrollTop = y;

  function box(list) {
    const el = h('div', { class: 'jd-cols' });
    boxes.push({ el, cards: list });
    return el;
  }
}

function cardEl(c) {
  const lines = previewLines(c.body, c.title);
  // One chip per site: three links to the same site would show three identical chips.
  const hosts = new Set();
  const urls = noteUrls(c.body).filter((url) => !hosts.has(urlHost(url)) && hosts.add(urlHost(url))).slice(0, 3);
  const card = h('article', { class: `note-card note-${c.color}${c.pinned ? ' is-pinned' : ''}`, tabindex: 0, 'data-id': c.id, 'aria-label': c.title || t.empty },
    h('span', { class: 'card-paper', 'aria-hidden': 'true' }),
    h('span', { class: 'card-tape', 'aria-hidden': 'true' }));
  card.style.setProperty('--tilt', tiltFor(c.id));
  if (c.image) card.append(cover(c.image));
  if (c.title) card.append(h('h3', { text: c.title }));
  if (lines.length) {
    card.append(h('div', { class: 'note-preview' }, lines.map((line) => (line.line === undefined
      ? h('div', { class: 'jd-line', text: line.text || ' ' })
      : task(c, line)))));
  }
  if (!c.title && !lines.length && !c.image) card.append(h('p', { class: 'jd-muted', text: t.empty }));
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
    h('div', { class: 'card-actions' }, colorButton(c)));
  card.addEventListener('click', (e) => {
    if (e.target.closest('button, a, input, .card-menu')) return;
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

function showColors(anchor, c) {
  closeMenu();
  const menu = h('div', { class: 'card-menu', role: 'menu' });
  COLOR_KEYS.forEach((key, i) => {
    const on = c.color === key;
    menu.append(h('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(on),
      onclick: (e) => { e.stopPropagation(); closeMenu(); if (!on) update({ type: 'setColor', id: c.id, color: key }); } },
    h('span', { class: `swatch note-${key}`, 'aria-hidden': 'true' }), t.colors[i], on ? h('span', { class: 'menu-check', text: '✓' }) : null));
  });
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8))}px`;
  const below = r.bottom + 4;
  menu.style.top = `${below + menu.offsetHeight > window.innerHeight ? Math.max(8, r.top - menu.offsetHeight - 4) : below}px`;
  openMenu = menu;
  setTimeout(() => document.addEventListener('click', closeMenu, { once: true }));
}

function closeMenu() {
  if (openMenu) openMenu.remove();
  openMenu = null;
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
