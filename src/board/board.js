import { noteUrls, previewLines, urlHost } from './note.js';
import { cardPreview, checklistOnly, tagOnly } from './card-preview.js';
import { planMove, sortCards } from './order.js';
import { drawingFileName, read as readDrawing } from '../cloud-shared/drawing.mjs';
import { createDrawingEditor } from '../cloud-shared/drawing-editor.mjs';
import { DEFAULT_WARN, INTRO, PAPER_DRAWER, WARN_OPTIONS, drawerName, expiresBadge, inDrawer, isPaperDrawer, shortDate } from '../cloud-shared/paper.mjs';
import { createAsk } from './ask.js';
import { createDuplicates } from './duplicates.js';
import { sizeText } from '../fileChips.mjs';

const PAGE = 60;
const COLOR_KEYS = ['default', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'gray'];
const STRINGS = {
  en: {
    checkedItems: (n) => `+ ${n} checked ${n === 1 ? 'item' : 'items'}`, openNote: (n) => n ? `Open note - ${n} more ${n === 1 ? 'task' : 'tasks'}` : 'Open note',
    search: 'Search your notes', allNotebooks: 'All notebooks', allTags: 'All', takeNote: 'Take a note…', title: 'Title',
    close: 'Close', savesTo: 'Saves to', pinned: 'Pinned', others: 'Others', pin: 'Pin', unpin: 'Unpin', color: 'Color',
    noNotes: 'No notes yet. Take your first note above.', noMatch: 'No notes match.', empty: 'Empty note',
    changed: 'This checklist changed in the meantime. The board shows the latest version again.', failed: 'That did not work. Please try again.',
    saved: 'Note saved', due: 'Due', overdue: 'Overdue', notes: (n) => (n === 1 ? '1 note' : `${n} notes`),
    cloudOff: 'JotDrop Cloud', cloudOn: '✓ Cloud', cloudProblem: '⚠ Cloud', cloudTitle: 'Bring in notes from the JotDrop app',
    archive: 'Archive', unarchive: 'Back to the board', archived: 'Note archived', unarchived: 'Note back on the board', archiveView: 'Archive', archiveEmpty: 'Nothing in the archive.',
    remind: 'Remind me', laterToday: 'Later today', tomorrow: 'Tomorrow', nextWeek: 'Next week', pickTime: 'Pick a date and time', setReminder: 'Set reminder', removeReminder: 'Remove reminder', reminderAndroid: 'Allow notifications for Joplin in your phone settings, or this reminder stays silent.',
    colors: ['Default', 'Red', 'Orange', 'Yellow', 'Cream', 'Slate blue', 'Blue', 'Purple', 'Pink', 'Brown', 'Gray'],
    drawing: 'Drawing', newDrawing: 'New drawing', editDrawing: 'Edit drawing', drawingSaved: 'Drawing saved', drawingDesktop: 'Drawing works in Joplin on the desktop for now.',
    drawLabels: {},
    paperDrawer: 'Paper drawer', newDrawer: 'New drawer', newDrawerName: 'Name of the new drawer', newDrawerPlaceholder: 'For example Work', create: 'Create',
    drawer: 'Drawer', expiresOn: 'Expires on', warnMe: 'Warn me', warnNone: 'No warning',
    warn: { '1w': '1 week before', '1m': '1 month before', '2m': '2 months before', '3m': '3 months before' },
    warnHint: 'A warning replaces this note\'s reminder.', save: 'Save', takeOut: 'Take out of the drawer', paperSaved: 'Saved in the paper drawer', tookOut: 'Taken out of the paper drawer',
    expires: (d) => `Expires ${d}`, expired: (d) => `Expired ${d}`, tipClose: 'Close this tip', toTop: 'Back to the top',
    intro: { title: INTRO.title, lead: INTRO.lead, points: INTRO.points.map((p) => p.text), phone: INTRO.phone },
    share: 'Share by link', loading: 'Loading…', shareKind: 'Share', copyKind: 'Send a copy (read only)', listKind: 'Share a live list (people can tick items)', noChecklist: 'This note has no checklist.',
    explainCopy: 'Anyone with the link can read a copy of this note\'s text, without an account. Photos and other attachments stay behind. Later changes to the note are not in the copy.',
    explainList: 'Anyone with the link can tick items and add items, without an account, and gives a name so you see who did what. Their ticks come into this note while Joplin is open on this computer, and what you tick goes to the list. Photos and other attachments stay behind.',
    worksFor: 'Link works for', days: { 1: '1 day', 7: '7 days', 30: '30 days', 0: 'Until I remove it' }, make: 'Make link', making: 'Encrypting and sending…',
    made: 'Send this link yourself. It holds the key, so we never see it.', linkField: 'Link', copy: 'Copy', copied: 'Link copied.',
    yourLinks: 'Your links', remove: 'Remove', endLink: 'End link', gone: 'The link no longer works.', untitled: 'Untitled note',
    ends: (d) => `Ends ${d}`, untilRemoved: 'Until you remove it', live: (ends, updated) => `Live list, ${ends ? `ends ${ends}` : 'until you end it'}, updated ${updated}`, notHere: 'note not found in this Joplin',
    ticked: (by, item) => `✓ ${by} ticked "${item}"`, addedItem: (by, item) => `${by} added "${item}"`, justNow: 'just now', minAgo: (n) => `${n} min. ago`, hrAgo: (n) => `${n} hr. ago`,
    connectFirst: 'Connect JotDrop Cloud first. Then you can share a note by link.', plusSite: 'JotDrop Plus on the website', liveBadge: 'Live list link',
    openFile: (name) => `Open ${name}`, moreFiles: (n) => (n === 1 ? '+ 1 file' : `+ ${n} files`),
    ask: 'Ask JotDrop', askTitle: 'Ask JotDrop: AI with your own key', askNote: 'Ask JotDrop about this note…', dup: 'Find duplicates', dupTitle: 'Find duplicate notes on this device, without AI', summarize: 'Summarize with AI',
    transcribe: 'Transcribe with AI', readPhoto: 'Read photo with AI', receipt: 'Receipt to Paper drawer…',
  },
  nl: {
    checkedItems: (n) => `+ ${n} ${n === 1 ? 'afgevinkt item' : 'afgevinkte items'}`, openNote: (n) => n ? `Open notitie - nog ${n} ${n === 1 ? 'taak' : 'taken'}` : 'Open notitie',
    search: 'Zoek in je notities', allNotebooks: 'Alle notitieboeken', allTags: 'Alles', takeNote: 'Maak een notitie…', title: 'Titel',
    close: 'Sluiten', savesTo: 'Komt in', pinned: 'Vastgezet', others: 'Overige', pin: 'Vastzetten', unpin: 'Losmaken', color: 'Kleur',
    noNotes: 'Nog geen notities. Maak hierboven je eerste notitie.', noMatch: 'Geen notities gevonden.', empty: 'Lege notitie',
    changed: 'Deze checklist is intussen veranderd. Het bord toont weer de nieuwste versie.', failed: 'Dat lukte niet. Probeer het nog eens.',
    saved: 'Notitie bewaard', due: 'Klaar op', overdue: 'Te laat', notes: (n) => (n === 1 ? '1 notitie' : `${n} notities`),
    cloudOff: 'JotDrop Cloud', cloudOn: '✓ Cloud', cloudProblem: '⚠ Cloud', cloudTitle: 'Notities uit de JotDrop-app binnenhalen',
    archive: 'Archiveren', unarchive: 'Terug op het bord', archived: 'Notitie gearchiveerd', unarchived: 'Notitie staat weer op het bord', archiveView: 'Archief', archiveEmpty: 'Niets in het archief.',
    remind: 'Herinner me', laterToday: 'Later vandaag', tomorrow: 'Morgen', nextWeek: 'Volgende week', pickTime: 'Kies datum en tijd', setReminder: 'Herinnering zetten', removeReminder: 'Herinnering weghalen', reminderAndroid: 'Sta meldingen voor Joplin toe in je telefooninstellingen, anders blijft deze herinnering stil.',
    colors: ['Standaard', 'Rood', 'Oranje', 'Geel', 'Crème', 'Leiblauw', 'Blauw', 'Paars', 'Roze', 'Bruin', 'Grijs'],
    drawing: 'Tekening', newDrawing: 'Nieuwe tekening', editDrawing: 'Tekening bewerken', drawingSaved: 'Tekening bewaard', drawingDesktop: 'Tekenen werkt voorlopig in Joplin op de desktop.',
    drawLabels: {
      title: 'Tekening', save: 'Opslaan', cancel: 'Annuleren', canvas: 'Tekenvlak', colors: 'Kleur', widths: 'Dikte',
      black: 'Zwart', blue: 'Blauw', red: 'Rood', green: 'Groen', orange: 'Oranje', purple: 'Paars',
      thin: 'Dun', medium: 'Middel', thick: 'Dik', eraser: 'Gum', undo: 'Ongedaan maken', redo: 'Opnieuw', clear: 'Wissen',
      clearAsk: 'De hele tekening wissen?', discardAsk: 'Deze tekening weggooien?', saving: 'Opslaan…',
    },
    paperDrawer: 'Paper drawer', newDrawer: 'Nieuw laatje', newDrawerName: 'Naam van het nieuwe laatje', newDrawerPlaceholder: 'Bijvoorbeeld Werk', create: 'Maken',
    drawer: 'Laatje', expiresOn: 'Verloopt op', warnMe: 'Waarschuw me', warnNone: 'Geen waarschuwing',
    warn: { '1w': '1 week vooraf', '1m': '1 maand vooraf', '2m': '2 maanden vooraf', '3m': '3 maanden vooraf' },
    warnHint: 'Een waarschuwing vervangt de herinnering van deze notitie.', save: 'Opslaan', takeOut: 'Uit de la halen', paperSaved: 'Bewaard in de Paper drawer', tookOut: 'Uit de Paper drawer gehaald',
    expires: (d) => `Verloopt ${d}`, expired: (d) => `Verlopen ${d}`, tipClose: 'Deze tip sluiten', toTop: 'Terug naar boven',
    intro: {
      title: 'Je papierla', lead: 'Scan een brief, een polis of een paspoort en hij komt hier terecht.',
      points: [
        'De camera zoekt de randen van het papier en trekt het recht, zodat elke scan een nette PDF wordt.',
        'Elk woord op het papier is doorzoekbaar. Typ een polisnummer en het papier komt tevoorschijn.',
        'Staat er een vervaldatum op het papier, dan ziet JotDrop die en biedt aan je een week vooraf te herinneren.',
      ],
      phone: 'Scannen doe je met de JotDrop-app op je telefoon. Je scans verschijnen ook hier.',
    },
    share: 'Delen via link', loading: 'Laden…', shareKind: 'Delen', copyKind: 'Een kopie sturen (alleen lezen)', listKind: 'Een live lijst delen (anderen kunnen afvinken)', noChecklist: 'Deze notitie heeft geen checklist.',
    explainCopy: 'Iedereen met de link kan een kopie van de tekst van deze notitie lezen, zonder account. Foto\'s en andere bijlagen blijven achter. Latere wijzigingen in de notitie staan niet in de kopie.',
    explainList: 'Iedereen met de link kan zonder account afvinken en iets toevoegen, en geeft een naam op zodat je ziet wie wat deed. Hun vinkjes komen in deze notitie zolang Joplin op deze computer openstaat, en wat jij afvinkt gaat naar de lijst. Foto\'s en andere bijlagen blijven achter.',
    worksFor: 'Link werkt', days: { 1: '1 dag', 7: '7 dagen', 30: '30 dagen', 0: 'Tot ik hem weghaal' }, make: 'Link maken', making: 'Versleutelen en versturen…',
    made: 'Stuur deze link zelf door. De sleutel zit in de link, dus wij zien hem nooit.', linkField: 'Link', copy: 'Kopiëren', copied: 'Link gekopieerd.',
    yourLinks: 'Je links', remove: 'Weghalen', endLink: 'Link stoppen', gone: 'De link werkt niet meer.', untitled: 'Notitie zonder titel',
    ends: (d) => `Stopt ${d}`, untilRemoved: 'Tot je hem weghaalt', live: (ends, updated) => `Live lijst, ${ends ? `stopt ${ends}` : 'tot je hem stopt'}, bijgewerkt ${updated}`, notHere: 'notitie niet gevonden in deze Joplin',
    ticked: (by, item) => `✓ ${by} vinkte "${item}" af`, addedItem: (by, item) => `${by} voegde "${item}" toe`, justNow: 'zojuist', minAgo: (n) => `${n} min. geleden`, hrAgo: (n) => `${n} uur geleden`,
    connectFirst: 'Koppel eerst JotDrop Cloud. Daarna kun je een notitie via een link delen.', plusSite: 'JotDrop Plus op de website', liveBadge: 'Live lijstlink',
    openFile: (name) => `${name} openen`, moreFiles: (n) => (n === 1 ? '+ 1 bestand' : `+ ${n} bestanden`),
    ask: 'Vraag JotDrop', askTitle: 'Vraag JotDrop: AI met je eigen sleutel', askNote: 'Vraag JotDrop over deze notitie…', dup: 'Dubbele notities', dupTitle: 'Dubbele notities zoeken op dit apparaat, zonder AI', summarize: 'Samenvatten met AI',
    transcribe: 'Uitschrijven met AI', readPhoto: 'Foto lezen met AI', receipt: 'Bon naar de Paper drawer…',
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
// Where to land when the board comes back from a note: { id, top, y, shown }, used once by the first render.
let restore = null;
const previews = new Map();
// The task just ticked on a card stays a moment as ☑, then joins "+ N checked items" (like Keep).
const TICK_SHOWN_MS = 400;
let justTicked;
const cardPreviews = new Map();
// `paper` is the open Paper drawer ("paper drawer") or one small drawer ("paper drawer/work"), or ''.
const state = { cloud: null, cards: [], folders: [], drawers: [], paperTipClosed: false, boardFolder: '', query: '', folderId: '', tag: '', paper: '', archive: false, found: null };

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
const PENCIL = 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z';
// A paper tray for the Paper drawer; the box above already means the Archive here.
const TRAY = 'M19 3H4.99C3.88 3 3.01 3.89 3.01 5L3 19c0 1.1.88 2 1.99 2H19c1.1 0 2-.9 2-2V5c0-1.11-.9-2-2-2zm0 12h-4c0 1.66-1.35 3-3 3s-3-1.34-3-3H4.99V5H19v10z';
const PLUS = 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z';
const SHARE = 'M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z';
// Sparkles for Ask JotDrop, the same sign as in the web app and Obsidian.
const SPARKLES = 'M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z';
// File chips, by kind (cloud/shared/filekinds.json); the file name next to the icon says the same in words.
const FILE_ICONS = {
  pdf: 'M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z',
  video: 'M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z',
  file: 'M6 2c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6H6zm7 7V3.5L18.5 9H13z',
};
// Two sheets for Find duplicates, the same sign as in Obsidian.
const COPY = 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z';
// The files Ask JotDrop can send, in its "What goes along" list; the kind is also there in words.
const ASK_FILE_ICONS = {
  image: 'M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z',
  pdf: FILE_ICONS.pdf,
  audio: 'M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z',
};
const LINK = 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z';

async function post(message) {
  const result = await webviewApi.postMessage(message);
  if (result && typeof result === 'object' && result.error) throw new Error(result.error);
  return result;
}

// Ask JotDrop runs in the plugin's main process; this page shows its window (ask.js).
const askJotDrop = createAsk({ h, post, toast, openCard, fileIcon: (kind) => icon(ASK_FILE_ICONS[kind] || FILE_ICONS.file) });
// Find duplicates compares on this device; "Merge with AI" hands the pair to the Ask window.
const duplicates = createDuplicates({ h, post, openAsk: (options) => askJotDrop.open(options) });

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
    if (data.scroll && data.scroll.y > 0) {
      restore = data.scroll;
      // The board stays hidden until it is back at its old place, so it does not show the top first and then jump.
      document.documentElement.classList.add('jd-restoring');
      setTimeout(revealBoard, 2000);
    }
    t = STRINGS[String(data.locale).slice(0, 2)] || STRINGS.en;
    locale = String(data.locale).replace('_', '-');
    document.documentElement.dataset.platform = data.platform;
    buildShell();
  }
  applyTheme();
  state.cloud = data.cloud;
  renderCloudButton(data.cloud);
  // Nothing changed for the board (our own write coming back, a note it does not show): cards stay put.
  const same = JSON.stringify([data.cards, data.folders, data.drawers, data.paperTipClosed, data.boardFolder]);
  if (same === lastData) return;
  lastData = same;
  Object.assign(state, { cards: data.cards, folders: data.folders, drawers: data.drawers || [], paperTipClosed: !!data.paperTipClosed, boardFolder: data.boardFolder });
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
    if (message.type === 'saveDrawing') throw error;
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
  if (old) {
    cardPreviews.get(card.id)?.destroy();
    const replacement = cardEl(card);
    old.replaceWith(replacement);
    cardPreviews.get(card.id)?.fit();
  }
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
    && (!state.paper || inDrawer(c.tags, state.paper))
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
  const cloud = h('button', { type: 'button', class: 'jd-chip jd-cloud', title: t.cloudTitle,
    onclick: async () => {
      try {
        const { message } = await post({ type: 'cloud' });
        if (message) toast(message);
      } catch { toast(t.failed); }
      scheduleReload(0);
    } });
  // Drawing is for everyone (Eric, 2 Nov): a new drawing becomes a note with the picture in it, like on Android.
  const draw = h('button', { type: 'button', class: 'jd-chip jd-draw', title: t.newDrawing, 'aria-label': t.newDrawing,
    onclick: () => openDrawing(null, async (png) => {
      const card = await post({ type: 'saveDrawing', png, name: drawingFileName(), title: t.drawing, folderId: state.folderId });
      previews.set(card.id, card.preview);
      state.cards.unshift(card);
      renderAll(true);
      toast(t.drawingSaved);
    }) }, icon(PENCIL), ` ${t.drawing}`);
  const askChip = h('button', { type: 'button', class: 'jd-chip jd-draw jd-ask-chip', title: t.askTitle, onclick: (e) => { e.stopPropagation(); askJotDrop.open(); } }, icon(SPARKLES), ` ${t.ask}`);
  const dupChip = h('button', { type: 'button', class: 'jd-chip jd-draw jd-dup-chip', title: t.dupTitle, onclick: (e) => { e.stopPropagation(); duplicates.open(); } }, icon(COPY), ` ${t.dup}`);
  const count = h('p', { class: 'jd-count' });
  const tags = h('div', { class: 'jd-tags' });
  const grid = h('div', { class: 'jd-grid' });
  const more = h('div', { class: 'jd-more', 'aria-hidden': 'true' });
  const toastEl = h('div', { class: 'jd-toast', role: 'status', 'aria-live': 'polite' });
  // The board comes back where it was, so a long board needs a quick way up to the search and filters (forum, 5 Nov).
  const scroller = document.scrollingElement || document.documentElement;
  const toTop = h('button', { type: 'button', class: 'jd-totop', title: t.toTop, 'aria-label': t.toTop,
    onclick: () => scroller.scrollTo({ top: 0 }) }, '↑');
  const showToTop = () => toTop.classList.toggle('is-shown', scroller.scrollTop > window.innerHeight);
  window.addEventListener('scroll', showToTop, { passive: true });
  els = { search, folder, archive, cloud, count, tags, grid, more, toast: toastEl };
  const top = h('header', { class: 'jd-top' },
    h('div', { class: 'jd-brand' }, h('span', { class: 'jd-word', text: 'JotDrop' }), count),
    h('div', { class: 'jd-filters' }, search, folder, archive, draw, askChip, dupChip, cloud));
  document.getElementById('jotdrop-root').replaceChildren(top, tags, buildComposer(), grid, more, toTop, toastEl);
  new ResizeObserver(() => { if (columnCount() !== columnsShown) renderGrid(); }).observe(grid);
  new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) loadMore(); }, { rootMargin: '800px' }).observe(more);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  document.addEventListener('click', closeMenu);
  setupDrag();
}

// ---- drawing ----

// A yes/no box inside the drawing overlay: the webview has no window.confirm of its own.
function ask(overlay, text, yesLabel) {
  return new Promise((resolve) => {
    const done = (answer) => { box.remove(); resolve(answer); };
    const box = h('div', { class: 'jd-draw-ask', role: 'alertdialog', 'aria-modal': 'true' },
      h('p', { text }),
      h('div', { class: 'jd-draw-ask-actions' },
        h('button', { type: 'button', onclick: () => done(false) }, t.drawLabels.cancel || 'Cancel'),
        h('button', { type: 'button', class: 'jd-draw-ask-yes', onclick: () => done(true) }, yesLabel)));
    overlay.append(box);
    box.querySelector('.jd-draw-ask-yes').focus();
  });
}

// The drawing screen shared with the web app and the Obsidian plugin, over the board. `onSave` gets the PNG as base64.
function openDrawing(initial, onSave) {
  const labels = { ...t.drawLabels };
  const overlay = h('div', { class: 'jd-draw-overlay', role: 'dialog', 'aria-modal': 'true' });
  const editor = createDrawingEditor({
    initial,
    labels,
    confirm: (text) => ask(overlay, text, text === (labels.clearAsk || 'Clear the whole drawing?') ? (labels.clear || 'Clear') : (labels.discard || 'Discard')),
    onCancel: () => overlay.remove(),
    onSave: async ({ png }) => {
      let text = '';
      for (let i = 0; i < png.length; i += 0x8000) text += String.fromCharCode(...png.subarray(i, i + 0x8000));
      try {
        await onSave(btoa(text));
      } catch (error) {
        throw new Error(String(error && error.message) === 'desktop' ? t.drawingDesktop : t.failed);
      }
      overlay.remove();
    },
  });
  overlay.append(editor.element);
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); editor.close(); } });
  document.body.append(overlay);
  editor.canvas.focus();
}

// Edit drawing: the lines of the card's picture open again; saving makes a new picture that takes its place in the note.
async function editDrawing(c, image) {
  let drawing = null;
  try {
    const data = atob(await post({ type: 'drawingData', id: image.id }));
    drawing = readDrawing(Uint8Array.from(data, (ch) => ch.charCodeAt(0)));
  } catch { /* not readable: told below */ }
  if (!drawing) return toast(t.failed);
  openDrawing(drawing, async (png) => {
    await update({ type: 'saveDrawing', png, name: drawingFileName(), noteId: c.id, replaces: image.id }, t.drawingSaved);
  });
}

function drawButton(c, image) {
  return h('button', { type: 'button', class: 'jd-act jd-draw-edit', title: t.editDrawing, 'aria-label': t.editDrawing,
    onclick: (e) => { e.stopPropagation(); editDrawing(c, image); } }, icon(PENCIL));
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

function renderCloudButton(cloud) {
  if (!cloud) return;
  els.cloud.textContent = !cloud.connected ? t.cloudOff : cloud.total ? `Cloud ${cloud.done}/${cloud.total}` : cloud.problem ? t.cloudProblem : t.cloudOn;
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
  // Drawers have their own chips below, so they are not #tags as well.
  for (const c of inFolder()) for (const tag of c.tags) if (!isPaperDrawer(tag)) counts.set(tag, (counts.get(tag) || 0) + 1);
  const names = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([name]) => name);
  if (state.tag && !names.includes(state.tag)) names.push(state.tag);
  // The chosen chip carries a ✓ as well as its colour (colour-blind safe).
  const chip = (label, value) => {
    const on = state.tag === value;
    return h('button', { type: 'button', class: 'jd-chip', 'aria-pressed': String(on), onclick: () => { state.tag = value; renderAll(true); } }, on ? '✓ ' : '', label);
  };
  els.tags.replaceChildren(...paperChips(), ...(names.length ? [chip(t.allTags, ''), ...names.map((n) => chip(`#${n}`, n))] : []));
}

// ---- paper drawer ----

const BASE = PAPER_DRAWER.toLowerCase();
/** "paper drawer/work" as "Work"; Joplin keeps tags in lower case. */
const drawerShown = (tag) => { const name = drawerName(tag); return name ? name[0].toUpperCase() + name.slice(1) : t.paperDrawer; };
/** The note's drawer tag, or ''. */
const paperOf = (c) => c.tags.find(isPaperDrawer) || '';

// The Paper drawer is always there, also before the first paper, so people find it. Once open, its small drawers follow.
function paperChips() {
  const cards = inFolder();
  const open = state.paper;
  const count = (selected) => cards.filter((c) => inDrawer(c.tags, selected)).length;
  const pick = (value) => () => { state.paper = value; renderAll(true); };
  const chip = (text, on, go, extra = '', path = null, n = 0) => h('button', { type: 'button', class: `jd-chip jd-paper-chip${extra}`, 'aria-pressed': String(on),
    onclick: (e) => { e.stopPropagation(); go(); } },
  on ? '✓ ' : '', path ? icon(path) : null, text, n ? h('span', { class: 'jd-chip-count', text: String(n) }) : null);
  const out = [chip(t.paperDrawer, open === BASE, pick(open ? '' : BASE), '', TRAY, count(BASE))];
  if (!open) return out;
  const small = [...new Set([...state.drawers, ...cards.flatMap((c) => c.tags.filter((tag) => drawerName(tag)))])]
    .sort((a, b) => drawerName(a).localeCompare(drawerName(b)));
  for (const tag of small) out.push(chip(drawerShown(tag), open === tag, pick(open === tag ? BASE : tag), ' is-small-drawer', null, count(tag)));
  const add = chip(t.newDrawer, false, () => showNewDrawer(add), ' is-small-drawer', PLUS);
  return [...out, add];
}

// The webview has no window.prompt, so the name is asked in a small menu.
function showNewDrawer(anchor, onMade) {
  closeMenu();
  const input = h('input', { type: 'text', class: 'menu-time', placeholder: t.newDrawerPlaceholder, 'aria-label': t.newDrawerName });
  const make = async () => {
    if (!input.value.trim()) return input.focus();
    closeMenu();
    try {
      const tag = await post({ type: 'newDrawer', name: input.value });
      if (!state.drawers.includes(tag)) state.drawers.push(tag);
      if (onMade) return onMade(tag);
      state.paper = tag;
      renderAll(true);
    } catch { toast(t.failed); }
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); make(); } });
  const menu = h('div', { class: 'card-menu', role: 'dialog', 'aria-label': t.newDrawerName },
    h('label', { class: 'menu-pick' }, t.newDrawerName, input),
    h('button', { type: 'button', class: 'menu-set', onclick: make }, t.create));
  showMenu(menu, anchor);
  input.focus();
}

// What the drawer does: in full while it is empty, as a closable tip above the papers.
function paperIntro(tip) {
  const box = h('section', { class: `jd-paper-intro${tip ? ' is-tip' : ''}` },
    h('div', { class: 'jd-paper-intro-head' }, icon(TRAY), h(tip ? 'strong' : 'h2', { text: t.intro.title })),
    tip ? null : h('p', { class: 'jd-paper-intro-lead', text: t.intro.lead }),
    h('ul', {}, t.intro.points.map((text) => h('li', { text }))),
    h('p', { class: 'jd-paper-intro-phone', text: t.intro.phone }));
  if (tip) {
    box.prepend(h('button', { type: 'button', class: 'jd-act jd-paper-intro-close', title: t.tipClose, 'aria-label': t.tipClose,
      onclick: () => { state.paperTipClosed = true; box.remove(); post({ type: 'closePaperTip' }).catch(() => {}); } }, '✕'));
  }
  return box;
}

function dayShown(day) {
  if (locale.startsWith('en')) return shortDate(day);
  const [y, m, d] = day.split('-').map(Number);
  try { return new Date(y, m - 1, d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return shortDate(day); }
}

// The words say expired or not; the dashed border only adds emphasis (colour-blind safe).
function expiresEl(c) {
  const badge = expiresBadge(c.expires);
  if (!badge) return null;
  return h('p', { class: `card-reminder card-expires${badge.expired ? ' is-overdue' : ''}`, text: `📅 ${(badge.expired ? t.expired : t.expires)(dayShown(c.expires))}` });
}

function paperButton(c) {
  const button = h('button', { type: 'button', class: 'jd-act', title: t.paperDrawer, 'aria-label': t.paperDrawer, 'aria-haspopup': 'dialog',
    onclick: (e) => { e.stopPropagation(); showPaper(button, c); } }, icon(TRAY));
  return button;
}

// Drawer, expiry date and warning for one note. A new date warns a week before unless changed; a date that is
// already there keeps its reminder.
function showPaper(anchor, c, drawerChoice) {
  closeMenu();
  const current = drawerChoice || paperOf(c) || BASE;
  const drawers = [...new Set([BASE, ...state.drawers, current])].sort((a, b) => (a === BASE ? -1 : b === BASE ? 1 : drawerName(a).localeCompare(drawerName(b))));
  const drawer = h('select', { class: 'menu-time', 'aria-label': t.drawer },
    drawers.map((tag) => h('option', { value: tag, text: drawerShown(tag), selected: tag === current })),
    h('option', { value: '+', text: `+ ${t.newDrawer}` }));
  drawer.addEventListener('change', () => {
    if (drawer.value !== '+') return;
    showNewDrawer(anchor, (tag) => showPaper(anchor, c, tag));
  });
  const date = h('input', { type: 'date', class: 'menu-time', 'aria-label': t.expiresOn, value: c.expires || '' });
  const warn = h('select', { class: 'menu-time', 'aria-label': t.warnMe },
    h('option', { value: '', text: t.warnNone }),
    WARN_OPTIONS.map((o) => h('option', { value: o.key, text: t.warn[o.key], selected: !c.expires && o.key === DEFAULT_WARN })));
  const save = () => {
    closeMenu();
    update({ type: 'setPaper', id: c.id, drawer: drawer.value, expires: date.value, warn: warn.value }, t.paperSaved);
  };
  const menu = h('div', { class: 'card-menu menu-paper', role: 'dialog', 'aria-label': t.paperDrawer },
    h('label', { class: 'menu-pick' }, t.drawer, drawer),
    h('label', { class: 'menu-pick' }, t.expiresOn, date),
    h('label', { class: 'menu-pick' }, t.warnMe, warn),
    h('p', { class: 'menu-note', text: t.warnHint }),
    h('button', { type: 'button', role: 'menuitem', class: 'menu-set', onclick: save }, t.save),
    paperOf(c) || c.expires ? h('button', { type: 'button', role: 'menuitem', onclick: () => { closeMenu(); update({ type: 'setPaper', id: c.id, drawer: '' }, t.tookOut); } }, t.takeOut) : null);
  showMenu(menu, anchor);
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
  const count = fromTop ? Math.min(PAGE, all.length) : Math.min(Math.max(PAGE, shown, restore ? restore.shown : 0), all.length);
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
  // An empty drawer explains itself; a filled one shows a tip until it is closed.
  const emptyDrawer = state.paper && !cards.length && !state.query.trim() && !state.tag && !state.archive;
  if (emptyDrawer) parts.push(paperIntro(false));
  else if (state.paper && cards.length && !state.paperTipClosed) parts.push(paperIntro(true));
  if (pinned.length) parts.push(h('h2', { class: 'jd-section', text: t.pinned }), boxes.pinned);
  if (pinned.length && others.length) parts.push(h('h2', { class: 'jd-section', text: t.others }));
  if (others.length) parts.push(boxes.others);
  if (!cards.length && !emptyDrawer) parts.push(h('p', { class: 'jd-empty', text: state.archive ? t.archiveEmpty : (state.cards.length ? t.noMatch : t.noNotes) }));
  els.grid.replaceChildren(...parts);
  for (const preview of cardPreviews.values()) preview.destroy();
  cardPreviews.clear();
  order = all;
  shown = 0;
  place(count);
  scroller.scrollTop = restore ? restore.y : (fromTop ? 0 : y);
  // Photos load after this, so the opened card itself is put back where it was; the browser then keeps it there.
  const back = restore && restore.id ? els.grid.querySelector(`[data-id="${restore.id}"]`) : null;
  if (back) scroller.scrollTop += back.getBoundingClientRect().top - restore.top;
  restore = null;
  revealBoard();
  loadMore();
}

function revealBoard() {
  document.documentElement.classList.remove('jd-restoring');
}

// Keep-style stacking: every card goes to the shortest column, so newest stays near the top.
function place(count) {
  for (const card of order.slice(shown, shown + count)) {
    const cols = [...(card.pinned ? boxes.pinned : boxes.others).children];
    let best = cols[0];
    for (const col of cols) if (col.offsetHeight < best.offsetHeight) best = col;
    best.append(cardEl(card));
    cardPreviews.get(card.id)?.fit();
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
  const lines = previewLines(shownNote.body, c.title, Infinity, Infinity);
  // One chip per site: three links to the same site would show three identical chips.
  const hosts = new Set();
  const urls = noteUrls(shownNote.body).filter((url) => !hosts.has(urlHost(url)) && hosts.add(urlHost(url))).slice(0, 3);
  const card = h('article', { class: `note-card note-${c.color}${c.pinned ? ' is-pinned' : ''}`, tabindex: 0, 'data-id': c.id, 'aria-label': c.title || t.empty },
    h('span', { class: 'card-paper', 'aria-hidden': 'true' }),
    h('span', { class: 'card-tape', 'aria-hidden': 'true' }));
  card.style.setProperty('--tilt', tiltFor(c.id));
  if (shownNote.image) card.append(cover(shownNote.image));
  if (c.title) card.append(h('h3', { text: c.title }));
  if (shownNote.audio) card.append(h('audio', { class: 'card-audio', controls: true, preload: 'metadata', src: shownNote.audio }));
  if (lines.length) {
    const preview = h('div', { class: 'note-preview' });
    card.append(preview);
    // Like Keep: only a note of nothing but tasks is a checklist card; elsewhere a task reads as ☐/☑ text.
    const isTask = (line) => line.line !== undefined, isMeta = (line) => !line.text.trim() || tagOnly(line.text);
    const asText = !checklistOnly(lines, isTask, isMeta);
    cardPreviews.set(c.id, cardPreview(preview, lines, {
      isTask, isMeta, isChecked: (line) => line.checked,
      lingering: (line) => justTicked?.id === c.id && justTicked.line === line.line ? Math.max(0, TICK_SHOWN_MS - (performance.now() - justTicked.at)) : 0,
      render: (line) => !isTask(line) ? h('div', { class: 'jd-line', text: line.text || ' ' })
        : asText ? h('div', { class: 'jd-line', text: `${line.checked ? '☑' : '☐'} ${line.text}` }) : task(c, line),
      height: () => window.innerHeight,
      openLabel: t.openNote, checkedLabel: t.checkedItems, open: () => openCard(c.id),
    }));
  }
  const files = shownNote.files || [];
  if (files.length) card.append(fileChips(c, files));
  if (!c.title && !lines.length && !shownNote.image && !shownNote.audio && !files.length) card.append(h('p', { class: 'jd-muted', text: t.empty }));
  const expires = expiresEl(c);
  if (expires) card.append(expires);
  if (c.isTodo && c.due) card.append(dueBadge(c));
  // A word, not only an icon or a colour (colour-blind safe), like the website's mark.
  if (c.listLink) card.append(h('p', { class: 'card-reminder card-listlink', text: `🔗 ${t.liveBadge}` }));
  const chips = [
    ...c.tags.map((tag) => (isPaperDrawer(tag)
      ? h('span', { class: 'jd-tagchip jd-drawerchip' }, icon(TRAY), drawerShown(tag))
      : h('span', { class: 'jd-tagchip', text: `#${tag}` }))),
    ...urls.map((url) => h('a', { class: 'link-chip', href: url, title: url,
      onclick: (e) => { e.preventDefault(); e.stopPropagation(); post({ type: 'openUrl', url }).catch(() => toast(t.failed)); } }, icon(LINK), urlHost(url))),
  ];
  if (chips.length) card.append(h('div', { class: 'jd-chips' }, chips));
  card.append(
    h('button', { type: 'button', class: 'card-pin', 'aria-pressed': String(c.pinned), title: c.pinned ? t.unpin : t.pin, 'aria-label': c.pinned ? t.unpin : t.pin,
      onclick: (e) => { e.stopPropagation(); update({ type: 'setPinned', id: c.id, pinned: !c.pinned }); } }, icon(PIN, c.pinned)),
    h('div', { class: 'card-actions' }, colorButton(c), reminderButton(c), paperButton(c), shareButton(c), askButton(c, shownNote.askFiles), archiveButton(c), shownNote.image && shownNote.image.drawing ? drawButton(c, shownNote.image) : null));
  card.addEventListener('click', (e) => {
    if (swallowClick || e.target.closest('button, a, input, audio, .card-menu')) return;
    openCard(c.id);
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target === card) openCard(c.id);
  });
  return card;
}

// The board remembers where it was, so coming back from the note lands on the same card. A filter or search is
// not kept when the board reopens, so only the plain board's place is worth remembering.
function openCard(id) {
  const plain = !state.query.trim() && !state.folderId && !state.tag && !state.paper && !state.archive;
  const y = plain ? (document.scrollingElement || document.documentElement).scrollTop : 0;
  const card = els.grid.querySelector(`[data-id="${id}"]`);
  const top = card ? card.getBoundingClientRect().top : 0;
  post({ type: 'open', id, y, top, shown }).catch(() => toast(t.failed));
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
      text: line.checked ? '☑' : '☐', onclick: (e) => {
        e.stopPropagation();
        justTicked = line.checked ? undefined : { id: c.id, line: line.line, at: performance.now() };
        update({ type: 'toggleTask', id: c.id, line: line.line, checked: !line.checked, expectedUpdated: c.updated });
      } }),
    h('span', { text: line.text, 'data-preview-task-text': '' }));
}

// Like the website, Obsidian and Android: up to three files as chips with name and size, the rest as "+ N files".
// On the desktop a chip opens the file in the computer's own app; on a phone it opens the note, where Joplin shows it.
// "+ N files" passes through to the card click: the note shows them all.
const FILE_CHIPS_VISIBLE = 3;
function fileChips(c, files) {
  const desktop = document.documentElement.dataset.platform === 'desktop';
  const chips = files.slice(0, FILE_CHIPS_VISIBLE).map((file) => {
    const label = file.size ? `${t.openFile(file.name)}, ${sizeText(file.size)}` : t.openFile(file.name);
    return h('button', { type: 'button', class: 'file-chip', title: label, 'aria-label': label,
      onclick: (e) => {
        e.stopPropagation();
        if (desktop) post({ type: 'openFile', id: file.id }).catch(() => toast(t.failed));
        else openCard(c.id);
      } },
    icon(FILE_ICONS[file.kind] || FILE_ICONS.file),
    h('span', { class: 'file-chip-name', text: file.name }),
    file.size ? h('span', { class: 'file-chip-size', text: `· ${sizeText(file.size)}` }) : null);
  });
  const rest = files.length - FILE_CHIPS_VISIBLE;
  return h('div', { class: 'jd-files' }, chips, rest > 0 ? h('span', { class: 'file-more', text: t.moreFiles(rest) }) : null);
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
  // Joplin only asks for this permission in its own alarm screen, and a plugin cannot ask or check it.
  if (document.documentElement.dataset.platform === 'mobile') menu.append(h('p', { class: 'menu-note', text: t.reminderAndroid }));
  showMenu(menu, anchor);
}

function showMenu(menu, anchor) {
  menu.addEventListener('click', (e) => e.stopPropagation());
  document.body.append(menu);
  placeMenu(menu, anchor);
  openMenu = menu;
}

function placeMenu(menu, anchor) {
  const r = anchor.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8))}px`;
  const below = r.bottom + 4;
  menu.style.top = `${below + menu.offsetHeight > window.innerHeight ? Math.max(8, r.top - menu.offsetHeight - 4) : below}px`;
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

// ---- Ask JotDrop ----

// kinds: the files of the card Ask JotDrop can send (from the preview). Version 2 adds an item only for a card with
// such a file: a recording to write out, a photo to read, a photo or PDF of a receipt.
function askButton(c, kinds = []) {
  const button = h('button', { type: 'button', class: 'jd-act', title: t.ask, 'aria-label': t.ask, 'aria-haspopup': 'menu',
    onclick: (e) => {
      e.stopPropagation();
      closeMenu();
      const note = { id: c.id, title: c.title, listLink: c.listLink };
      const go = (options) => () => { closeMenu(); askJotDrop.open({ note, ...options }); };
      const item = (label, options) => h('button', { type: 'button', role: 'menuitem', onclick: go(options) }, label);
      showMenu(h('div', { class: 'card-menu', role: 'menu' },
        item(t.askNote, {}),
        item(t.summarize, { summarize: true }),
        kinds.includes('audio') ? item(t.transcribe, { action: 'transcribe' }) : null,
        kinds.includes('image') ? item(t.readPhoto, { action: 'photo' }) : null,
        kinds.includes('image') || kinds.includes('pdf') ? item(t.receipt, { action: 'receipt' }) : null), button);
    } }, icon(SPARKLES));
  return button;
}

// ---- sharing by link (Joplin desktop with JotDrop Cloud) ----

function shareButton(c) {
  if (document.documentElement.dataset.platform !== 'desktop') return null;
  const button = h('button', { type: 'button', class: 'jd-act', title: t.share, 'aria-label': t.share, 'aria-haspopup': 'dialog',
    onclick: (e) => { e.stopPropagation(); showShare(button, c); } }, icon(SHARE));
  return button;
}

function ago(iso) {
  const seconds = Math.round((Date.now() - Date.parse(iso || '')) / 1000);
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 60) return t.justNow;
  if (seconds < 3600) return t.minAgo(Math.floor(seconds / 60));
  if (seconds < 86400) return t.hrAgo(Math.floor(seconds / 3600));
  return dateShown(iso);
}

function dateShown(iso) {
  try { return new Date(iso).toLocaleDateString(locale); } catch { return new Date(iso).toLocaleDateString(); }
}

async function copyLink(address) {
  try { await post({ type: 'copy', text: address }); toast(t.copied); } catch { toast(t.failed); }
}

// A copy anyone can read, or a live list anyone can tick: the same choice as on the website and in Obsidian.
async function showShare(anchor, c) {
  closeMenu();
  const menu = h('div', { class: 'card-menu menu-share', role: 'dialog', 'aria-label': t.share }, h('p', { class: 'menu-note', text: t.loading }));
  showMenu(menu, anchor);
  let info;
  try { info = await post({ type: 'shareInfo', id: c.id }); } catch { if (openMenu === menu) closeMenu(); toast(t.failed); return; }
  if (openMenu !== menu) return;
  menu.replaceChildren();
  if (!info.connected) {
    menu.append(h('p', { class: 'menu-note', text: t.connectFirst }),
      h('button', { type: 'button', class: 'menu-set', onclick: () => { closeMenu(); els.cloud.click(); } }, t.cloudOff));
    placeMenu(menu, anchor);
    return;
  }
  const kind = h('select', { class: 'menu-time', 'aria-label': t.shareKind },
    h('option', { value: 'copy', text: t.copyKind }),
    info.checklist ? h('option', { value: 'list', text: t.listKind }) : null);
  const explain = h('p', { class: 'menu-note' });
  const explained = () => { explain.textContent = kind.value === 'list' ? t.explainList : t.explainCopy; };
  kind.addEventListener('change', explained);
  explained();
  const days = h('select', { class: 'menu-time', 'aria-label': t.worksFor },
    [1, 7, 30, 0].map((n) => h('option', { value: String(n), text: t.days[n], selected: n === 7 })));
  const message = h('p', { class: 'menu-note', role: 'status' });
  const made = h('div', { class: 'menu-made' });
  const links = h('div', { class: 'menu-links' });
  const make = h('button', { type: 'button', class: 'menu-set', onclick: async () => {
    make.disabled = true;
    message.textContent = t.making;
    made.replaceChildren();
    try {
      const result = await post({ type: 'makeLink', id: c.id, kind: kind.value, days: Number(days.value) });
      if (result.problem) {
        message.textContent = result.problem;
        if (result.plusUrl) message.append(' ', h('button', { type: 'button', class: 'menu-inline', onclick: () => post({ type: 'openUrl', url: result.plusUrl }).catch(() => toast(t.failed)) }, t.plusSite));
        return;
      }
      const field = h('input', { type: 'text', class: 'menu-time menu-field', readonly: true, 'aria-label': t.linkField, value: result.address });
      made.append(field, h('button', { type: 'button', class: 'menu-set', onclick: () => copyLink(result.address) }, t.copy));
      message.textContent = t.made;
      if (kind.value === 'list') { c.listLink = true; scheduleReload(); }
      await showLinks(links, message, anchor);
    } catch { message.textContent = t.failed; } finally { make.disabled = false; if (openMenu === menu) placeMenu(menu, anchor); }
  } }, t.make);
  menu.append(...[
    h('label', { class: 'menu-pick' }, t.shareKind, kind),
    info.checklist ? null : h('p', { class: 'menu-note', text: t.noChecklist }),
    explain,
    h('label', { class: 'menu-pick' }, t.worksFor, days),
    make, message, made, links].filter(Boolean));
  renderLinks(links, info, message, anchor);
  placeMenu(menu, anchor);
}

async function showLinks(el, message, anchor) {
  const info = await post({ type: 'shareInfo', id: '' }).catch(() => null);
  if (info && info.connected) renderLinks(el, info, message, anchor);
}

// Your links on every device: copies with Copy and Remove, live lists with who ticked or added what.
function renderLinks(el, info, message, anchor) {
  el.replaceChildren();
  if (!info.links.length && !info.lists.length) return;
  const end = (link, kind) => async () => {
    try { await post({ type: 'endLink', linkId: link.id, kind }); message.textContent = t.gone; } catch { message.textContent = t.failed; }
    if (kind === 'list') scheduleReload();
    await showLinks(el, message, anchor);
    if (openMenu) placeMenu(openMenu, anchor);
  };
  const row = (title, lines, link, kind) => h('div', { class: 'menu-link' },
    h('strong', { text: title || t.untitled }),
    lines.map((line) => h('span', { text: line })),
    h('div', { class: 'menu-link-buttons' },
      link.address ? h('button', { type: 'button', onclick: () => copyLink(link.address) }, t.copy) : null,
      h('button', { type: 'button', onclick: end(link, kind) }, kind === 'list' ? t.endLink : t.remove)));
  el.append(h('h4', { class: 'menu-heading', text: t.yourLinks }),
    ...info.links.map((link) => row(link.title, [link.expiresAt ? t.ends(dateShown(link.expiresAt)) : t.untilRemoved], link, 'copy')),
    ...info.lists.map((link) => row(link.title, [
      `${t.live(link.expiresAt ? dateShown(link.expiresAt) : '', ago(link.updatedAt))}${link.here === false ? ` - ${t.notHere}` : ''}`,
      ...link.marks.map((mark) => `${(mark.added ? t.addedItem : t.ticked)(mark.by, mark.text)}, ${ago(new Date(mark.at).toISOString())}`),
    ], link, 'list')));
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
    if (!el || e.button !== 0 || !e.isPrimary || e.target.closest('button, a, input, select, textarea, audio')) return;
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
    else askJotDrop.onMessage(message);
  });
  load();
}

start();
