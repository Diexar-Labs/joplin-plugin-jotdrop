// Find duplicates on the Joplin board (Ask JotDrop v2, part E, phase 7): the same flow as the web app and the Obsidian
// plugin. The notes are compared in the plugin's main process (src/ai.ts, with cloud-shared/similar.mjs), on this
// device, without AI and without sending anything. Per pair: Compare, move one note to the trash, Keep both, and,
// when the AI is on, Merge with AI (the Ask window takes over). Moving a note to the trash is always the user's own
// click. The window is in English, like the Ask window.
const mobile = () => document.documentElement.dataset.platform === 'mobile';
const here = () => (mobile() ? 'this phone' : 'this computer');

export function createDuplicates({ h, post, openAsk }) {
  let overlay = null;

  function close() {
    overlay?.remove();
    overlay = null;
  }

  async function open() {
    close();
    const me = h('div', { class: 'jd-ask-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Find duplicates' });
    overlay = me;
    const status = h('p', { class: 'jd-ask-status', role: 'status', 'aria-live': 'polite', text: `Looking for duplicates on ${here()}...` });
    const list = h('ul', { class: 'jd-dup-list' });
    me.append(h('div', { class: 'jd-ask' },
      h('div', { class: 'jd-ask-head' }, h('h2', { text: 'Find duplicates' }), h('div', { class: 'jd-ask-head-actions' }, h('button', { type: 'button', onclick: close }, 'Close'))),
      h('p', { class: 'jd-ask-note', text: `JotDrop compares your notes on ${here()}. Finding duplicates uses no AI and sends nothing. "Merge with AI" is a separate choice: it sends the two notes you pick to your AI service.${mobile() ? '' : ' Notes with a live list link are left out (when JotDrop Cloud is connected on this computer).'} Very short notes and the trash are left out too.` }),
      status, list));
    me.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    me.addEventListener('click', (e) => e.stopPropagation());
    document.body.append(me);

    const when = (note) => (note.updatedAt ? `edited ${new Date(note.updatedAt).toLocaleDateString()}` : 'no edit date');

    async function showCompare(box, pair) {
      let shown;
      try { shown = await post({ type: 'aiCompare', a: pair.older.id, b: pair.newer.id }); } catch (error) { status.textContent = String(error?.message || error); box.hidden = true; return; }
      if (!shown.lines) { box.replaceChildren(h('p', { text: 'These notes are too long to compare here.' })); return; }
      box.replaceChildren(h('p', { class: 'jd-ask-note', text: `From the older note "${pair.older.title}" to the newer note "${pair.newer.title}": + was added, - was removed.` }),
        ...shown.lines.map((line) => h('div', { class: `jd-ask-diff ${line.type}`, text: line.type === 'gap' ? `${line.count} unchanged ${line.count === 1 ? 'line' : 'lines'}` : `${line.sign} ${line.text}` })));
    }

    async function render() {
      let found;
      try { found = await post({ type: 'aiDuplicates' }); } catch (error) { status.textContent = String(error?.message || error); return; }
      if (overlay !== me) return;
      const more = found.complete ? '' : ' The search stopped early, so this list may not be complete. Deal with these, then search again.';
      const { pairs } = found;
      status.textContent = pairs.length ? `${pairs.length} ${pairs.length === 1 ? 'pair' : 'pairs'} found.${more}` : found.complete ? 'No duplicate notes found.' : 'Nothing found yet, and the search stopped early. Try again.';
      list.replaceChildren(...pairs.map((pair) => {
        const drop = pair.drop === pair.older.id ? pair.older : pair.newer;
        const box = h('div', { class: 'jd-dup-compare', hidden: true });
        const buttons = h('div', { class: 'jd-ask-buttons' },
          h('button', { type: 'button', onclick: async () => { box.hidden = !box.hidden; if (!box.hidden) await showCompare(box, pair); } }, 'Compare'),
          // The button names the note: the older one, or for "inside" the shorter one, never the note that holds more.
          h('button', { type: 'button', onclick: async () => { try { await post({ type: 'aiTrash', id: drop.id }); } catch (error) { status.textContent = String(error?.message || error); return; } render(); } }, `Move "${drop.title}" to the trash`),
          h('button', { type: 'button', onclick: async () => { try { await post({ type: 'aiKeep', a: pair.older.id, b: pair.newer.id }); } catch (error) { status.textContent = String(error?.message || error); return; } render(); } }, 'Keep both'),
          found.aiOn ? h('button', { type: 'button', onclick: () => { close(); openAsk({ merge: { older: { id: pair.older.id, title: pair.older.title }, newer: { id: pair.newer.id, title: pair.newer.title } } }); } }, 'Merge with AI…') : null);
        // Words, not color: the kind is written out.
        const kind = pair.kind === 'same' ? 'Same text' : pair.kind === 'near' ? `Almost the same (${Math.round(pair.score * 100)}%)` : `One note is inside the other (${Math.round(pair.score * 100)}% of "${drop.title}")`;
        return h('li', { class: 'jd-dup-item' }, h('h3', { text: kind }), h('p', { text: `Older: "${pair.older.title}", ${when(pair.older)}` }), h('p', { text: `Newer: "${pair.newer.title}", ${when(pair.newer)}` }), buttons, box);
      }));
    }

    // Let the window show first: many notes can take a few seconds.
    await new Promise((resolve) => setTimeout(resolve, 50));
    await render();
  }

  return { open };
}
