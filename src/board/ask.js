import { parseMarkdown } from '../cloud-shared/ai/markdown.mjs';
import { TRANSCRIBE_MODEL } from '../cloud-shared/ai/providers.mjs';
import { KEEP_YEARS, keepUntil } from '../cloud-shared/ai/receipt.mjs';
import { editorRequest, receiptLines } from '../cloud-shared/ai-web.mjs';
import { PAPER_DRAWER, validExpires } from '../cloud-shared/paper.mjs';
import { sizeText } from '../fileChips.mjs';

// Ask JotDrop on the Joplin board: the question window and its settings. The same flow as the web app and the
// Obsidian plugin: the list "What goes along" before anything leaves, a new note at once, a change to a note only
// after Apply, the answer as simple formatting built with textContent (never innerHTML), a Report button. The
// AI runs in the plugin's main process (src/ai.ts); this page never sees the key. The window is in English, like
// the web app's; its buttons on the board are also in Dutch.
//
// Version 2: the photos, PDFs and recordings of a note show in "What goes along", unticked; a file goes only when
// the user ticks it. The card's menu also opens three fixed actions with one file and no notes: write out a
// recording, read a photo, and read a receipt into one screen to check before anything is saved. The bytes never
// come to this page: the main process reads and sends them.

// "This computer" on Joplin desktop, "this phone" on Joplin for Android (the board stamps the platform on <html>).
const mobile = () => document.documentElement.dataset.platform === 'mobile';
const here = () => (mobile() ? 'this phone' : 'this computer');

const PROVIDER_NOTES = {
  ollama: 'Your request and notes stay on this computer: they go to Ollama running here. Choose a model that can use tools.',
  anthropic: 'Make an API key in your Anthropic account (Claude Console). The default model is Claude Haiku 5.5.',
  openai: 'Make an API key in your OpenAI account (platform.openai.com).',
  gemini: 'Make an API key in Google AI Studio. Outside the EEA, Switzerland and the UK, Google may use what you send on the free tier to improve its products; on the paid tier it does not.',
  openrouter: 'One key for many models. OpenRouter passes your request on to the company behind the model you choose. Load the models and pick one that can use tools.',
  custom: 'Any OpenAI-compatible service, such as LM Studio, a local server or Mistral. Use an https address, or an http address on this computer. A key is only needed if the service asks for one.',
};
const PROVIDER_NOTES_PHONE = {
  ...PROVIDER_NOTES,
  ollama: 'Only for Ollama running on this phone itself, at http://127.0.0.1:11434. Your request and notes then stay on this phone. Choose a model that can use tools.',
  custom: 'Any OpenAI-compatible service, such as Mistral or your own server. Use an https address, or an http address on this phone itself. A key is only needed if the service asks for one.',
};
const providerNote = (id) => (mobile() ? PROVIDER_NOTES_PHONE : PROVIDER_NOTES)[id];

// Where the key is kept. Joplin desktop: a secure setting (the system keychain). Joplin for Android 3.7 does not use a
// key store for plugin settings: the key sits in Joplin's own database inside the app (measured 11 Nov 2026).
const keyNote = () => (mobile()
  ? 'Your key stays on this phone, in Joplin\'s own app data. Joplin does not encrypt it there; Android keeps it away from other apps. It does not sync with your notes, so you add it again on each device.'
  : 'Your key stays on this computer, in Joplin\'s secure storage. It does not sync with your notes. On each computer you add it again.');

const LOCAL = /^http:\/\/(localhost|127\.\d+\.\d+\.\d+|\[::1\])(:|\/|$)/i;
const onThisComputer = (s) => s.provider === 'ollama' || (s.provider === 'custom' && LOCAL.test(s.baseUrl));

const FILE_WORDS = { image: 'Photo', pdf: 'PDF', audio: 'Recording' };
const FILE_NOUNS = { image: 'photo', pdf: 'PDF', audio: 'recording' };

export function createAsk({ h, post, toast, openCard, fileIcon }) {
  let current = null;

  const spec = (settings, id) => settings.providers.find((p) => p.id === id);

  // OpenAI writes out a recording with its own model, which the line names.
  function via(settings, action, files = false) {
    const service = spec(settings, settings.provider);
    if (!service) return '';
    const model = (action === 'transcribe' && settings.provider === 'openai' ? TRANSCRIBE_MODEL : settings.model || service.defaultModel) || 'no model chosen';
    if (onThisComputer(settings)) return `Goes to ${settings.provider === 'ollama' ? 'Ollama' : settings.baseUrl} on ${here()}, model ${model}. Your request${files ? ', notes and files' : ' and notes'} stay on ${here()}.`;
    if (settings.provider === 'custom') return `Goes straight to ${settings.baseUrl}, model ${model}. Nothing goes to JotDrop.`;
    return `Goes straight to ${service.name}, model ${model}. Nothing goes to JotDrop.`;
  }

  // The answer as simple formatting: bold, italic, code, headings, bullets. textContent only; links stay as typed.
  function showAnswer(target, text) {
    target.replaceChildren();
    let list = null;
    let pre = null;
    for (const block of parseMarkdown(text)) {
      if (block.kind !== 'bullet') list = null;
      if (block.kind !== 'code') pre = null;
      if (block.kind === 'space') continue;
      const spans = (parent) => {
        for (const span of block.spans) {
          let node = parent;
          for (const [on, tag] of [[span.bold, 'strong'], [span.italic, 'em'], [span.code, 'code']]) if (on) { const inner = document.createElement(tag); node.append(inner); node = inner; }
          node.append(document.createTextNode(span.text));
        }
      };
      if (block.kind === 'bullet') {
        if (!list) { list = h('ul', { class: 'jd-ask-list' }); target.append(list); }
        const item = h('li');
        item.style.marginLeft = `${block.level * 1.2}em`;
        spans(item);
        list.append(item);
      } else if (block.kind === 'code') {
        if (!pre) { pre = h('pre', { class: 'jd-ask-code' }); target.append(pre); } else pre.append('\n');
        pre.append(block.spans[0].text);
      } else {
        const p = h('p', { class: block.kind === 'heading' ? `jd-ask-h jd-ask-h${block.level}` : '' });
        spans(p);
        target.append(p);
      }
    }
  }

  function actionLine(action) {
    const title = action.title || 'a note';
    const words = {
      create_note: `Made the note "${title}"`, append_to_note: `Added to "${title}"`, replace_note_text: `Replaced the text of "${title}"`,
      set_labels: `Set the labels of "${title}"`, set_reminder: `Set a reminder on "${title}"`, set_expiry: `Set an expiry date on "${title}"`, open_note: `Opened "${title}"`,
    }[action.tool] || `Asked for "${action.tool}"`;
    const lower = words.charAt(0).toLowerCase() + words.slice(1);
    if (action.status === 'done') return `Done: ${words}.`;
    if (action.status === 'declined') return `Not changed: you said no (${lower}).`;
    if (action.reason === 'unknown_tool') return `Refused: the AI asked for "${action.tool}", which Ask JotDrop cannot do. Deleting, archiving and sharing stay yours to do.`;
    if (action.reason === 'not_allowed') return 'Left alone: that note has a live list link, and those are kept out.';
    return `Did not work: ${lower}.`;
  }

  function close() {
    if (!current) return;
    if (current.busy) post({ type: 'aiStop', token: current.token }).catch(() => {});
    clearTimeout(current.goesTimer);
    current.overlay.remove();
    current = null;
  }

  /**
   * Opens the window. note: ask about this card ({ id, title, listLink }); summarize: only that note, fixed request;
   * action: transcribe, photo or receipt, one file of that note with a fixed request, no notes and no tools.
   */
  async function open({ note = null, summarize = false, action = '' } = {}) {
    close();
    let settings;
    try { settings = await post({ type: 'aiSettings' }); } catch { toast('That did not work. Please try again.'); return; }
    if (!note) action = '';
    const me = { settings, note, summarize, action, excluded: new Map(), token: '', busy: false, goesTimer: 0, last: null, overlay: null, files: [], filesOn: new Set(), drawers: [], drawer: '', request: '' };
    current = me;

    // The note's files as the main process sees them (no bytes), with why one cannot go with this service. A file
    // action starts with the first one that can go.
    async function loadFiles() {
      if (!note || summarize) return;
      let shown = { files: [], drawers: [], drawer: '', request: '' };
      try { shown = await post({ type: 'aiFiles', noteId: note.id, action }); } catch { /* no files then */ }
      me.files = shown.files;
      me.drawers = shown.drawers;
      me.drawer = shown.drawer;
      me.request = shown.request || '';
      me.filesOn = new Set([...me.filesOn].filter((id) => me.files.some((file) => file.id === id && !file.problem)));
      if (action && !me.filesOn.size) { const first = me.files.find((file) => !file.problem); if (first) me.filesOn.add(first.id); }
    }
    await loadFiles();
    if (current !== me) return;

    const overlay = h('div', { class: 'jd-ask-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Ask JotDrop' });
    me.overlay = overlay;
    const main = h('section', { class: 'jd-ask-main' });
    const setup = h('section', { class: 'jd-ask-settings', hidden: true });
    const settingsButton = h('button', { type: 'button', 'aria-expanded': 'false', onclick: () => toggleSettings(setup.hidden) }, 'Settings');
    const panel = h('div', { class: 'jd-ask' },
      h('div', { class: 'jd-ask-head' }, h('h2', { text: 'Ask JotDrop' }), h('div', { class: 'jd-ask-head-actions' }, settingsButton, h('button', { type: 'button', onclick: close }, 'Close'))),
      main, setup);
    overlay.append(panel);
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    overlay.addEventListener('click', (e) => e.stopPropagation());
    document.body.append(overlay);

    function toggleSettings(show) {
      setup.hidden = !show;
      main.hidden = show;
      settingsButton.textContent = show ? 'Back to the question' : 'Settings';
      settingsButton.setAttribute('aria-expanded', String(show));
      // Another service can read other files: the list is asked again.
      if (show) renderSettings(setup, me, async () => { await loadFiles(); if (current === me) renderMain(); });
    }

    const offReason = () => {
      if (!me.settings.provider) return 'Ask JotDrop is off. Choose an AI service, and add your own key, in its settings.';
      if (note && note.listLink && !me.settings.includeShared) {
        return action
          ? 'This note has a live list link. Ask JotDrop keeps those notes and their files out, unless you switch on "Also use notes with a live list link" in its settings.'
          : 'This note has a live list link. Ask JotDrop keeps those out, unless you switch on "Also use notes with a live list link" in its settings.';
      }
      return '';
    };
    const fixedRequest = () => (summarize && note ? editorRequest('summarize', note.title || 'Untitled') : action ? me.request : '');
    const sending = () => me.files.filter((file) => me.filesOn.has(file.id) && !file.problem);

    let el = null;
    let fixed = '';
    function renderMain() {
      fixed = fixedRequest();
      const off = offReason();
      const request = h('textarea', { class: 'jd-ask-request', rows: 3, 'aria-label': 'Your request', placeholder: 'Ask about your notes, or tell JotDrop what to do. For example: put milk and bread on the shopping list.' });
      request.value = el && !fixed ? el.request.value : fixed;
      request.readOnly = Boolean(fixed);
      const goesSummary = h('summary');
      const goesList = h('ul', { class: 'jd-ask-goes-list' });
      const goesText = action
        ? 'Only the chosen file goes, with the fixed request above. No notes go along, and the AI cannot change anything.'
        : `These notes go along with your question. Clear a note to keep it out. Ask JotDrop looks among the notes with words of your question; while answering, the AI can search and read more of those. You see which ones afterwards.${me.files.length ? ' A file of the note goes only when you tick it.' : ''}`;
      const goesFiles = h('p', { class: 'jd-ask-note', hidden: true, text: `The ticked file goes to the AI service as it is${mobile() ? '' : ', straight from this computer'}. A photo or recording can hold other people's details, so only send what you may share.` });
      const goes = h('details', { class: 'jd-ask-goes' }, goesSummary, h('p', { class: 'jd-ask-note', text: goesText }), goesList, goesFiles);
      // A file action shows the file at once: the user sends it, or chooses another one first.
      goes.open = Boolean(action);
      const send = h('button', { type: 'button', class: 'jd-ask-primary', onclick: () => sendRequest() }, 'Send');
      const stop = h('button', { type: 'button', hidden: true, onclick: () => post({ type: 'aiStop', token: me.token }).catch(() => {}) }, 'Stop');
      const status = h('p', { class: 'jd-ask-status', role: 'status', 'aria-live': 'polite' });
      const confirmTitle = h('h3');
      const confirmBody = h('div');
      const apply = h('button', { type: 'button', class: 'jd-ask-primary', onclick: () => answerConfirm(true) }, 'Apply');
      const confirm = h('div', { class: 'jd-ask-confirm', hidden: true }, confirmTitle, confirmBody,
        h('div', { class: 'jd-ask-buttons' }, apply, h('button', { type: 'button', onclick: () => answerConfirm(false) }, 'Do not change')));
      const badge = h('p', { class: 'jd-ask-badge' });
      const answer = h('div', { class: 'jd-ask-answer' });
      const sources = h('div', { class: 'jd-ask-buttons' });
      const actions = h('ul', { class: 'jd-ask-actions' });
      const also = h('p', { class: 'jd-ask-note' });
      const usage = h('p', { class: 'jd-ask-note' });
      const useButtons = h('div', { class: 'jd-ask-buttons' });
      const reportBox = h('div', { class: 'jd-ask-report', hidden: true });
      const receipt = h('div', { class: 'jd-ask-confirm jd-ask-receipt', hidden: true });
      const result = h('div', { class: 'jd-ask-result', hidden: true }, badge, answer, receipt, sources, actions, also, usage, useButtons, reportBox);
      const offBox = h('div', { class: 'jd-ask-off', hidden: !off }, h('p', { text: off }),
        !me.settings.provider ? h('button', { type: 'button', class: 'jd-ask-primary', onclick: () => toggleSettings(true) }, 'Open settings') : null);
      const form = h('div', { class: 'jd-ask-form', hidden: Boolean(off) }, request, goes, h('div', { class: 'jd-ask-buttons' }, send, stop));
      request.addEventListener('input', () => { clearTimeout(me.goesTimer); me.goesTimer = setTimeout(renderGoes, 250); });
      request.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendRequest(); } });
      const viaLine = h('p', { class: 'jd-ask-via', text: off ? '' : via(me.settings, action, sending().length > 0) });
      main.replaceChildren(offBox, viaLine, form, status, confirm, result);
      el = { request, goesSummary, goesList, goesFiles, via: viaLine, send, stop, status, confirm, confirmTitle, confirmBody, apply, result, badge, answer, receipt, sources, actions, also, usage, useButtons, reportBox };
      if (off) return;
      renderGoes();
      // Summarize starts at once; a file action waits for Send, so the user sees which file goes.
      if (fixed && !action && !me.last && !me.busy) sendRequest();
      else if (action) send.focus();
      else request.focus();
    }

    // The list is what really goes: the main process makes the same choice as the assistant, minus the notes cleared here.
    let goesAsked = 0;
    // A name of this window's own: radio buttons with one name form one group across the whole page.
    const groupName = `jd-ask-file-${Math.random().toString(36).slice(2)}`;
    async function renderGoes() {
      const asked = ++goesAsked;
      let picked = [];
      // A file action sends no notes, so there is nothing to ask about them.
      if (!action) {
        try { picked = (await post({ type: 'aiPreview', request: el.request.value, noteId: note?.id || '', mode: summarize ? 'summarize' : 'ask', excluded: [...me.excluded.keys()] })).notes; } catch { /* the list stays as it was */ return; }
      }
      if (asked !== goesAsked || current !== me) return;
      const row = (item, on) => {
        const box = h('input', { type: 'checkbox' });
        box.checked = on;
        box.addEventListener('change', () => { if (box.checked) me.excluded.delete(item.id); else me.excluded.set(item.id, item.title); renderGoes(); });
        return h('li', {}, h('label', {}, box, ` ${item.title || 'Untitled'}${on && item.truncated ? ' (shortened)' : ''}${on ? '' : ' (kept out)'}`));
      };
      // A file row: an icon, the name, the kind in words and the size; one that cannot go says why and cannot be
      // ticked. A file action sends one file, so there the rows are a choice of one.
      const fileRow = (file) => {
        const box = h('input', { type: action ? 'radio' : 'checkbox', name: groupName });
        box.disabled = Boolean(file.problem);
        box.checked = !file.problem && me.filesOn.has(file.id);
        box.addEventListener('change', () => {
          if (action) me.filesOn = new Set([file.id]);
          else if (box.checked) me.filesOn.add(file.id);
          else me.filesOn.delete(file.id);
          renderGoes();
        });
        const state = file.problem ? ` (cannot go: ${file.problem})` : box.checked ? '' : ' (stays home)';
        return h('li', {}, h('label', { class: 'jd-ask-file' }, box, ' ', fileIcon(file.kind), ` ${file.name} · ${FILE_WORDS[file.kind]}${file.bytes ? ` · ${sizeText(file.bytes)}` : ''}${state}`));
      };
      el.goesList.replaceChildren(...picked.map((item) => row(item, true)), ...[...me.excluded].map(([id, title]) => row({ id, title }, false)), ...me.files.map(fileRow));
      const files = sending();
      el.goesFiles.hidden = !files.length;
      el.via.textContent = offReason() ? '' : via(me.settings, action, files.length > 0);
      const noteWords = picked.length ? `${picked.length} ${picked.length === 1 ? 'note' : 'notes'}` : '';
      const fileWords = files.length ? `${files.length} ${files.length === 1 ? 'file' : 'files'}` : '';
      el.goesSummary.textContent = noteWords || fileWords ? `What goes along: ${[noteWords, fileWords].filter(Boolean).join(' and ')}` : action ? 'What goes along: no file yet' : 'What goes along: your question, no notes yet';
    }

    let confirmId = '';
    function showConfirm(message) {
      confirmId = message.id;
      el.confirmTitle.textContent = message.heading;
      const body = [];
      if (message.lines) {
        body.push(h('p', { class: 'jd-ask-note', text: '+ is added, - is removed.' }));
        for (const line of message.lines) body.push(h('div', { class: `jd-ask-diff ${line.type}`, text: line.type === 'gap' ? `${line.count} unchanged ${line.count === 1 ? 'line' : 'lines'}` : `${line.sign} ${line.text}` }));
      } else {
        const list = h('dl', { class: 'jd-ask-facts' });
        for (const [name, value] of message.facts || []) list.append(h('dt', { text: name }), h('dd', { text: value }));
        body.push(list);
      }
      el.confirmBody.replaceChildren(...body);
      el.confirm.hidden = false;
      el.status.textContent = 'Waiting for you: the AI asks to change a note.';
      el.apply.focus();
    }
    function answerConfirm(yes) {
      if (!confirmId) return;
      const id = confirmId;
      confirmId = '';
      el.confirm.hidden = true;
      el.status.textContent = yes ? 'Changing the note, then asking on...' : 'Not changed. Asking on...';
      post({ type: 'aiConfirmAnswer', id, yes }).catch(() => {});
    }
    me.confirm = showConfirm;

    function setBusy(busy) {
      me.busy = busy;
      el.send.disabled = busy;
      el.stop.hidden = !busy;
      el.request.readOnly = busy || Boolean(fixed);
    }

    async function sendRequest() {
      const request = el.request.value.trim();
      if (!request || me.busy || offReason()) return;
      const files = sending();
      if (action && !files.length) { el.status.textContent = me.files.length ? 'Choose a file first.' : `This note has no such file on ${here()}.`; return; }
      me.token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      me.last = null;
      el.result.hidden = true;
      el.confirm.hidden = true;
      el.reportBox.hidden = true;
      el.receipt.hidden = true;
      for (const part of [el.answer, el.sources, el.actions, el.useButtons, el.reportBox, el.receipt]) part.replaceChildren();
      setBusy(true);
      const service = spec(me.settings, me.settings.provider);
      el.status.textContent = `${files.length ? 'Reading the file, then asking' : 'Asking'} ${me.settings.provider === 'custom' ? me.settings.baseUrl : service?.name || 'the AI service'}...`;
      let result = null;
      try {
        result = await post({ type: 'aiAsk', token: me.token, request, noteId: note?.id || '', mode: summarize ? 'summarize' : 'ask', action, files: files.map((file) => file.id), excluded: [...me.excluded.keys()] });
      } catch (error) {
        if (current === me) el.status.textContent = String(error?.message || 'That did not work. Please try again.');
      }
      if (current !== me) return;
      confirmId = '';
      setBusy(false);
      el.confirm.hidden = true;
      if (!result) return;
      if (result.open) { close(); openCard(result.open); return; }
      showResult(result, request);
    }

    function showResult(result, request) {
      me.last = { result, request };
      el.status.textContent = result.problem;
      el.result.hidden = !(result.answer || result.actions.length || result.first || result.also.length);
      el.badge.textContent = `AI answer from ${result.service}, model ${result.model}. Check it before you rely on it.`;
      showAnswer(el.answer, result.answer || (result.problem ? '' : 'The AI gave no answer in words.'));
      for (const source of result.sources) el.sources.append(h('button', { type: 'button', onclick: () => { close(); openCard(source.id); } }, `Open "${source.title}"`));
      for (const action of result.actions) {
        el.actions.append(h('li', {}, actionLine(action),
          action.made ? h('button', { type: 'button', class: 'jd-ask-inline', onclick: () => { close(); openCard(action.made); } }, 'Open') : null));
      }
      // In words what went: the question (a recording goes on its own), the notes, and each file by name.
      const went = [...(action === 'transcribe' ? [] : ['your question']), ...(result.first ? [`${result.first} ${result.first === 1 ? 'note' : 'notes'}`] : []),
        ...result.files.map((file) => `the ${FILE_NOUNS[file.kind] || 'file'} "${file.name}"`)];
      const wentText = went.length > 1 ? `${went.slice(0, -1).join(', ')} and ${went[went.length - 1]}` : went[0];
      el.also.textContent = result.stop === 'off' || result.nothingSent ? 'Nothing was sent.'
        : `${result.failed ? 'Tried to send' : 'Sent'} to ${result.service}: ${wentText}${result.also.length ? `. While answering it also read: ${result.also.map((title) => `"${title}"`).join(', ')}` : ''}.`;
      const counted = result.usage.seconds ? `Recording: ${Math.round(result.usage.seconds)} seconds` : `Tokens: ${result.usage.input} in, ${result.usage.output} out`;
      el.usage.textContent = result.local ? `${counted}, on ${here()}.` : `${counted}. ${result.service} bills these to your account.`;
      if (!result.answer.trim()) return;
      if (result.receipt && note) { showReceipt(result); return; }
      if ((summarize || action) && note) {
        const below = h('button', { type: 'button', class: 'jd-ask-primary', onclick: async () => {
          try { await post({ type: 'aiAddBelow', id: note.id, text: result.answer }); el.status.textContent = 'Added below the note.'; below.remove(); } catch (error) { el.status.textContent = String(error?.message || error); }
        } }, 'Add below the note');
        el.useButtons.append(below);
      }
      const save = h('button', { type: 'button', onclick: async () => {
        const titled = { transcribe: 'Recording in', photo: 'Text from the photo in', receipt: 'Receipt in' }[action] || (summarize ? 'Summary of' : '');
        const title = titled && note ? `${titled} ${note.title || 'Untitled'}` : request.split('\n')[0].slice(0, 80);
        try { await post({ type: 'create', title, body: `${result.answer.trim()}\n` }); el.status.textContent = `Saved as the note "${title}".`; save.remove(); } catch (error) { el.status.textContent = String(error?.message || error); }
      } }, 'Save as a new note');
      el.useButtons.append(save, h('button', { type: 'button', onclick: toggleReport }, 'Report'));
    }

    // "Receipt to Paper drawer": the AI's fields in one screen to check and change. Nothing is saved before Apply,
    // and the AI's answer is only data here: the main process checked every field, and the date is worked out here.
    function showReceipt(result) {
      const found = result.receipt;
      el.answer.replaceChildren();
      el.useButtons.replaceChildren();
      const box = el.receipt;
      let n = 0;
      const field = (label, control) => {
        control.id = `${groupName}-r${++n}`;
        return h('div', { class: 'jd-ask-receipt-row' }, h('label', { for: control.id, text: label }), control);
      };
      const title = h('input', { type: 'text', maxlength: '120', autocomplete: 'off', placeholder: note.title || 'Title' });
      title.value = found.title || '';
      const drawer = h('select', {}, h('option', { value: '', text: PAPER_DRAWER }), me.drawers.map((name) => h('option', { value: name, text: `${PAPER_DRAWER} / ${name}` })));
      drawer.value = me.drawers.includes(me.drawer) ? me.drawer : '';
      const bought = h('input', { type: 'date' });
      bought.value = found.bought || '';
      const until = h('input', { type: 'date' });
      until.value = found.warrantyUntil || keepUntil(found.bought, 2);
      const lines = h('textarea', { rows: 3, maxlength: '400' });
      lines.value = receiptLines(found);
      const years = h('div', { class: 'jd-ask-buttons' });
      const yearsNote = h('p', { class: 'jd-ask-note', text: 'Fill in the day of purchase to use these.' });
      // The keep buttons count from the day of purchase; the pressed one carries a ✓, not only a colour.
      const renderYears = () => {
        const choice = (text, date) => {
          const pressed = Boolean(date) && date === until.value;
          const button = h('button', { type: 'button', 'aria-pressed': String(pressed), onclick: () => { until.value = date; renderYears(); } }, `${pressed ? '✓ ' : ''}${text}`);
          button.disabled = !date;
          return button;
        };
        years.replaceChildren(...KEEP_YEARS.map((count) => choice(`${count} ${count === 1 ? 'year' : 'years'}`, keepUntil(bought.value, count))),
          ...(found.warrantyUntil ? [choice('Date on the receipt', found.warrantyUntil)] : []));
        yearsNote.hidden = Boolean(bought.value);
      };
      for (const input of [bought, until]) input.addEventListener('input', renderYears);
      renderYears();
      const done = (text) => { box.hidden = true; el.status.textContent = text; };
      const apply = h('button', { type: 'button', class: 'jd-ask-primary', onclick: async () => {
        if (!validExpires(until.value)) { el.status.textContent = 'Choose how long to keep it, or fill in a date.'; return; }
        try {
          await post({ type: 'aiReceipt', id: note.id, updated: result.updated, title: title.value, lines: lines.value, expires: until.value, drawer: drawer.value });
          done(`Done: in the ${drawer.value ? `${PAPER_DRAWER} / ${drawer.value}` : PAPER_DRAWER}, kept until ${until.value}.`);
        } catch (error) { el.status.textContent = String(error?.message || error); }
      } }, 'Apply');
      box.replaceChildren(
        h('h3', { text: 'Receipt to Paper drawer' }),
        h('p', { class: 'jd-ask-note', text: 'What the AI read from the receipt. Change what is wrong; nothing is saved until you select Apply.' }),
        field('Title', title), field('Drawer', drawer), field('Day of purchase', bought),
        h('fieldset', { class: 'jd-ask-receipt-keep' }, h('legend', { text: 'Keep it for' }), years, yearsNote),
        field('Keep until', until), field('Added below the note', lines),
        h('div', { class: 'jd-ask-buttons' }, apply, h('button', { type: 'button', onclick: () => done('Not changed: the note stays as it was.') }, 'Do not change')));
      // The report stays: what went out and what it cost.
      el.useButtons.append(h('button', { type: 'button', onclick: toggleReport }, 'Report'));
      box.hidden = false;
      el.status.textContent = 'Check what the AI read. Nothing is saved until you select Apply.';
      title.focus();
    }

    // A report holds the question and the answer, never the notes or the key.
    function reportText() {
      const { result, request } = me.last;
      return `Ask JotDrop report\nAI service: ${result.service}\nModel: ${result.model}\nDate: ${new Date().toISOString()}\nApp: JotDrop for Joplin ${me.settings.version}\n\nQuestion:\n${request}\n\nAnswer:\n${result.answer}\n\nWhat is wrong with it:\n`;
    }
    function toggleReport() {
      const box = el.reportBox;
      if (!box.hidden) { box.hidden = true; return; }
      const mail = `mailto:hello@jotdrop.net?subject=${encodeURIComponent('Ask JotDrop report')}&body=${encodeURIComponent(reportText())}`;
      box.replaceChildren(
        h('p', { text: 'Is this answer wrong, harmful or strange? Send it to us with a few words about what is wrong. The report holds your question and the answer, not your notes or your key.' }),
        h('div', { class: 'jd-ask-buttons' },
          h('button', { type: 'button', class: 'jd-ask-primary', onclick: () => post({ type: 'openUrl', url: mail }).catch(() => toast('That did not work. Please try again.')) }, 'Write an email'),
          h('button', { type: 'button', onclick: () => post({ type: 'copy', text: reportText() }).then(() => toast('Report copied.'), () => toast('Could not copy the report.')) }, 'Copy the report')));
      box.hidden = false;
    }

    renderMain();
  }

  // The settings: service, key, address, model, notes with a list link. Saved only on Save; the key goes to the
  // main process and never comes back.
  function renderSettings(root, me, onSaved) {
    const saved = me.settings;
    let draft = { provider: saved.provider, key: '', model: saved.model, baseUrl: saved.baseUrl, includeShared: saved.includeShared };
    let models = null;
    let message = '';
    let problem = false;
    const say = (text, isProblem = false) => { message = text; problem = isProblem; render(); };
    const field = (label, control, note) => h('label', { class: 'jd-ask-field' }, h('span', { class: 'jd-ask-label', text: label }), control, note ? h('span', { class: 'jd-ask-note', text: note }) : null);

    function render() {
      const service = spec(saved, draft.provider);
      const select = h('select', { 'aria-label': 'AI service' }, h('option', { value: '', text: 'Off' }), saved.providers.map((p) => h('option', { value: p.id, text: p.name })));
      select.value = draft.provider;
      select.addEventListener('change', () => {
        const provider = select.value;
        draft = { ...draft, provider, key: '', model: provider === saved.provider ? saved.model : '', baseUrl: provider === saved.provider ? saved.baseUrl : draft.baseUrl };
        models = null;
        message = '';
        render();
      });
      const parts = [
        h('p', { text: `Optional and free. Ask JotDrop sends your question, and the notes it shows you first, straight from ${here()} to the AI service you choose, with your own key. JotDrop never sees them. A paid service bills you for what you use. New notes are made at once; a change to a note waits until you apply it.` }),
        h('p', { class: 'jd-ask-note', text: keyNote() }),
        field('AI service', select, draft.provider ? providerNote(draft.provider) : 'Ask JotDrop is off. Choose an AI service to turn it on.'),
      ];
      if (service) {
        if (draft.provider === 'custom') {
          const address = h('input', { type: 'text', placeholder: 'https://...', value: draft.baseUrl, 'aria-label': 'Address' });
          address.addEventListener('input', () => { draft.baseUrl = address.value.trim(); });
          parts.push(field('Address', address, mobile() ? 'The service\'s base address, for example https://api.mistral.ai/v1.' : 'The service\'s base address, for example http://127.0.0.1:1234/v1 for LM Studio.'));
        }
        if (service.needsKey || draft.provider === 'custom') {
          const hasKey = draft.provider === saved.provider && saved.hasKey;
          const key = h('input', { type: 'password', autocomplete: 'off', placeholder: hasKey ? 'Saved. Type a new key to replace it.' : 'Paste your key here', 'aria-label': 'API key' });
          key.value = draft.key;
          key.addEventListener('input', () => { draft.key = key.value.trim(); });
          parts.push(field(service.needsKey ? 'API key' : 'API key (if the service asks for one)', key));
        }
        const model = h('input', { type: 'text', placeholder: service.defaultModel || 'model id', value: draft.model, 'aria-label': 'Model' });
        model.addEventListener('input', () => { draft.model = model.value.trim(); });
        const load = h('button', { type: 'button', onclick: () => loadModels(load) }, 'Test and load models');
        const row = h('div', { class: 'jd-ask-row' }, model, load);
        if (models) {
          const list = h('select', { 'aria-label': 'Models of this service' }, h('option', { value: '', text: `Choose one of ${models.count} models` }),
            models.groups.map((group) => h('optgroup', { label: group.label === 'Cannot use tools' ? 'Cannot use tools: answers only, no changes' : group.label },
              group.models.map((m) => h('option', { value: m.id, text: m.name === m.id ? m.id : `${m.name} (${m.id})` })))));
          list.value = models.groups.some((group) => group.models.some((m) => m.id === draft.model)) ? draft.model : '';
          list.addEventListener('change', () => { if (list.value) { draft.model = list.value; render(); } });
          row.append(list);
        }
        parts.push(field('Model', row, service.defaultModel ? `Empty means the default, ${service.defaultModel}.` : 'Load the models and choose one that can use tools.'));
        // Joplin for Android has no JotDrop Cloud, so the plugin cannot tell which notes have a live list link: no
        // switch there (it would do nothing), only what happens instead.
        if (mobile()) {
          parts.push(h('p', { class: 'jd-ask-note', text: 'On this phone, notes with a live list link can go along, because JotDrop cannot tell which notes have one here. To keep one out, clear it in the list before you send.' }));
        } else {
          const shared = h('input', { type: 'checkbox' });
          shared.checked = draft.includeShared;
          shared.addEventListener('change', () => { draft.includeShared = shared.checked; });
          parts.push(h('label', { class: 'jd-ask-check' }, shared, ' Also use notes with a live list link'),
            h('p', { class: 'jd-ask-note', text: 'Off: notes that others can open through a live list link stay out of Ask JotDrop, as long as JotDrop Cloud is connected on this computer.' }));
        }
      }
      const remove = h('button', { type: 'button', class: 'jd-ask-warning', disabled: !saved.provider, onclick: removeKey }, 'Remove key and turn off');
      parts.push(h('div', { class: 'jd-ask-buttons' }, h('button', { type: 'button', class: 'jd-ask-primary', onclick: save }, 'Save'), remove));
      if (message) parts.push(h('p', { class: problem ? 'jd-ask-problem' : 'jd-ask-said', role: 'status', text: problem ? `Problem: ${message}` : message }));
      root.replaceChildren(...parts);
    }

    async function save() {
      try {
        const next = await post({ type: 'aiSave', ...draft });
        Object.assign(saved, next);
        draft = { provider: next.provider, key: '', model: next.model, baseUrl: next.baseUrl, includeShared: next.includeShared };
        say(next.provider ? `Saved. Ask JotDrop is on on ${here()}.` : 'Saved. Ask JotDrop is off.');
        onSaved();
      } catch (error) { say(String(error?.message || error), true); }
    }

    async function removeKey() {
      try {
        Object.assign(saved, await post({ type: 'aiRemove' }));
        draft = { provider: '', key: '', model: '', baseUrl: '', includeShared: false };
        models = null;
        say(`Ask JotDrop is off, and the key is removed from ${here()}.`);
        onSaved();
      } catch (error) { say(String(error?.message || error), true); }
    }

    async function loadModels(button) {
      button.disabled = true;
      button.textContent = 'Asking...';
      try {
        const list = await post({ type: 'aiModels', ...draft });
        const picked = !draft.model;
        if (picked) draft.model = list.preferred || '';
        models = list;
        const chosen = draft.model, tools = list.tools[chosen];
        const about = !chosen ? 'Choose a model.' : tools === undefined ? `"${chosen}" is not in the list of this service.` : tools === false ? `"${chosen}" cannot use tools: it can answer, but not make or change notes.` : picked && draft.provider === 'openrouter' ? `Model: ${chosen}, the cheapest one here that can use tools. Choose another one from the list if you like.` : `Model: ${chosen}.`;
        say(`Connected: ${list.count} ${list.count === 1 ? 'model' : 'models'}. ${about} Select Save to keep this.`);
      } catch (error) { say(String(error?.message || error), true); }
    }

    render();
  }

  return {
    open,
    /** Messages from the main process while a request runs. */
    onMessage(message) {
      if (message?.type === 'aiConfirm' && current && current.token === message.token && current.confirm) current.confirm(message);
    },
  };
}
