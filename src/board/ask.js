import { parseMarkdown } from '../cloud-shared/ai/markdown.mjs';
import { editorRequest } from '../cloud-shared/ai-web.mjs';

// Ask JotDrop on the Joplin board: the question window and its settings. The same flow as the web app and the
// Obsidian plugin: the list "What goes along" before anything leaves, a new note at once, a change to a note only
// after Apply, the answer as simple formatting built with textContent (never innerHTML), a Report button. The
// AI runs in the plugin's main process (src/ai.ts); this page never sees the key. The window is in English, like
// the web app's; its buttons on the board are also in Dutch.

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

export function createAsk({ h, post, toast, openCard }) {
  let current = null;

  const spec = (settings, id) => settings.providers.find((p) => p.id === id);

  function via(settings) {
    const service = spec(settings, settings.provider);
    if (!service) return '';
    const model = settings.model || service.defaultModel || 'no model chosen';
    if (onThisComputer(settings)) return `Goes to ${settings.provider === 'ollama' ? 'Ollama' : settings.baseUrl} on ${here()}, model ${model}. Your request and notes stay on ${here()}.`;
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

  /** Opens the window. note: ask about this card ({ id, title, listLink }); summarize: only that note, fixed request. */
  async function open({ note = null, summarize = false } = {}) {
    close();
    let settings;
    try { settings = await post({ type: 'aiSettings' }); } catch { toast('That did not work. Please try again.'); return; }
    const me = { settings, note, summarize, excluded: new Map(), token: '', busy: false, goesTimer: 0, last: null, overlay: null };
    current = me;

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
      if (show) renderSettings(setup, me, () => { renderMain(); });
    }

    const offReason = () => {
      if (!me.settings.provider) return 'Ask JotDrop is off. Choose an AI service, and add your own key, in its settings.';
      if (note && note.listLink && !me.settings.includeShared) return 'This note has a live list link. Ask JotDrop keeps those out, unless you switch on "Also use notes with a live list link" in its settings.';
      return '';
    };
    const fixed = summarize && note ? editorRequest('summarize', note.title || 'Untitled') : '';

    let el = null;
    function renderMain() {
      const off = offReason();
      const request = h('textarea', { class: 'jd-ask-request', rows: 3, 'aria-label': 'Your request', placeholder: 'Ask about your notes, or tell JotDrop what to do. For example: put milk and bread on the shopping list.' });
      request.value = el ? el.request.value : fixed;
      request.readOnly = Boolean(fixed);
      const goesSummary = h('summary');
      const goesList = h('ul', { class: 'jd-ask-goes-list' });
      const goes = h('details', { class: 'jd-ask-goes' }, goesSummary,
        h('p', { class: 'jd-ask-note', text: 'These notes go along with your question. Clear a note to keep it out. Ask JotDrop looks among the notes with words of your question; while answering, the AI can search and read more of those. You see which ones afterwards.' }), goesList);
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
      const result = h('div', { class: 'jd-ask-result', hidden: true }, badge, answer, sources, actions, also, usage, useButtons, reportBox);
      const offBox = h('div', { class: 'jd-ask-off', hidden: !off }, h('p', { text: off }),
        !me.settings.provider ? h('button', { type: 'button', class: 'jd-ask-primary', onclick: () => toggleSettings(true) }, 'Open settings') : null);
      const form = h('div', { class: 'jd-ask-form', hidden: Boolean(off) }, request, goes, h('div', { class: 'jd-ask-buttons' }, send, stop));
      request.addEventListener('input', () => { clearTimeout(me.goesTimer); me.goesTimer = setTimeout(renderGoes, 250); });
      request.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendRequest(); } });
      main.replaceChildren(offBox, h('p', { class: 'jd-ask-via', text: off ? '' : via(me.settings) }), form, status, confirm, result);
      el = { request, goesSummary, goesList, send, stop, status, confirm, confirmTitle, confirmBody, apply, result, badge, answer, sources, actions, also, usage, useButtons, reportBox };
      if (off) return;
      renderGoes();
      if (fixed && !me.last && !me.busy) sendRequest();
      else request.focus();
    }

    // The list is what really goes: the main process makes the same choice as the assistant, minus the notes cleared here.
    let goesAsked = 0;
    async function renderGoes() {
      const asked = ++goesAsked;
      let picked = [];
      try { picked = (await post({ type: 'aiPreview', request: el.request.value, noteId: note?.id || '', mode: summarize ? 'summarize' : 'ask', excluded: [...me.excluded.keys()] })).notes; } catch { /* the list stays as it was */ return; }
      if (asked !== goesAsked || current !== me) return;
      const row = (item, on) => {
        const box = h('input', { type: 'checkbox' });
        box.checked = on;
        box.addEventListener('change', () => { if (box.checked) me.excluded.delete(item.id); else me.excluded.set(item.id, item.title); renderGoes(); });
        return h('li', {}, h('label', {}, box, ` ${item.title || 'Untitled'}${on && item.truncated ? ' (shortened)' : ''}${on ? '' : ' (kept out)'}`));
      };
      el.goesList.replaceChildren(...picked.map((item) => row(item, true)), ...[...me.excluded].map(([id, title]) => row({ id, title }, false)));
      el.goesSummary.textContent = picked.length ? `What goes along: ${picked.length} ${picked.length === 1 ? 'note' : 'notes'}` : 'What goes along: your question, no notes yet';
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
      me.token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      me.last = null;
      el.result.hidden = true;
      el.confirm.hidden = true;
      el.reportBox.hidden = true;
      for (const part of [el.answer, el.sources, el.actions, el.useButtons, el.reportBox]) part.replaceChildren();
      setBusy(true);
      const service = spec(me.settings, me.settings.provider);
      el.status.textContent = `Asking ${me.settings.provider === 'custom' ? me.settings.baseUrl : service?.name || 'the AI service'}...`;
      let result = null;
      try {
        result = await post({ type: 'aiAsk', token: me.token, request, noteId: note?.id || '', mode: summarize ? 'summarize' : 'ask', excluded: [...me.excluded.keys()] });
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
      el.also.textContent = result.stop === 'off' ? 'Nothing was sent.'
        : `${result.failed ? 'Tried to send' : 'Sent'} to ${result.service}: your question${result.first ? ` and ${result.first} ${result.first === 1 ? 'note' : 'notes'}` : ''}${result.also.length ? `. While answering it also read: ${result.also.map((title) => `"${title}"`).join(', ')}` : ''}.`;
      el.usage.textContent = result.local
        ? `Tokens: ${result.usage.input} in, ${result.usage.output} out, on ${here()}.`
        : `Tokens: ${result.usage.input} in, ${result.usage.output} out. ${result.service} bills these to your account.`;
      if (!result.answer.trim()) return;
      if (summarize && note) {
        const below = h('button', { type: 'button', class: 'jd-ask-primary', onclick: async () => {
          try { await post({ type: 'aiAddBelow', id: note.id, text: result.answer }); el.status.textContent = 'Added below the note.'; below.remove(); } catch (error) { el.status.textContent = String(error?.message || error); }
        } }, 'Add below the note');
        el.useButtons.append(below);
      }
      const save = h('button', { type: 'button', onclick: async () => {
        const title = summarize && note ? `Summary of ${note.title || 'Untitled'}` : request.split('\n')[0].slice(0, 80);
        try { await post({ type: 'create', title, body: `${result.answer.trim()}\n` }); el.status.textContent = `Saved as the note "${title}".`; save.remove(); } catch (error) { el.status.textContent = String(error?.message || error); }
      } }, 'Save as a new note');
      el.useButtons.append(save, h('button', { type: 'button', onclick: toggleReport }, 'Report'));
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
