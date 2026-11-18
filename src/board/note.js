// plainPreviewText, stripInlineMarks, noteUrls, urlKey and urlHost are copied unchanged from
// JotDrop cloud/web/note.mjs (b59c35e). In a real build they would be imported from there.
import { blocks, cellText, linePrefix, listLevels, parseTable } from '../cloud-shared/format.mjs';

/** Plain card text, as the plugin shows it: no emphasis, code, quote, rule, table or escape marks. */
export function plainPreviewText(text) {
  const lines = [];
  let fence = '';
  for (const line of text.split('\n')) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) { if (!fence) fence = marker; else if (marker[0] === fence[0] && marker.length >= fence.length) fence = ''; continue; }
    if (fence) { lines.push(line); continue; }
    if (/^\s{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(line) || /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/.test(line)) continue;
    // A quoted checklist keeps its `>`, as in the plugin, where it must not become a checkbox.
    const unquoted = line.replace(/^(?:\s{0,3}>[ \t]?)+/, '');
    const plain = (unquoted !== line && /^\s*[-*+][ \t]+\[[ xX]\]/.test(unquoted) ? line : unquoted).replace(/^\[![\w-]+\][+-]?[ \t]*/, '');
    lines.push(/^\s*\|.*\|\s*$/.test(plain)
      ? (plain.match(/(?:\\.|[^|\\])+/g) || []).map((cell) => cell.trim()).filter(Boolean).map(stripInlineMarks).join(' · ')
      : stripInlineMarks(plain));
  }
  return lines.join('\n');
}

function stripInlineMarks(text) {
  return text.replace(/\\([!-/:-@[-`{-~])|(`+)([^`\n]+?)\2|(\*{3}|_{3}|\*\*|__|~~|==)(?=\S)(.*?\S)\4|(^|[^\w*])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?!\*)|(^|[^\w_])_(?=[^\s_])([^_\n]*?[^\s_])_(?!\w)|<br\s*\/?>/gi,
    (_whole, escaped, _ticks, code, _strong, strongText, starLead, starText, underLead, underText) => {
      if (escaped !== undefined) return escaped;
      if (code !== undefined) return code;
      if (strongText !== undefined) return stripInlineMarks(strongText);
      if (starText !== undefined) return starLead + stripInlineMarks(starText);
      if (underText !== undefined) return underLead + stripInlineMarks(underText);
      return ' ';
    });
}

/** The web links of a note for its link chips, like the plugin and Android: markdown targets and bare URLs, in order and once each. */
export function noteUrls(text) {
  let body = text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
    .replace(/!\[\[[^\]]+\]\]/g, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    // The first heading is the card title, so its link is not repeated as a chip.
    .replace(/^[ \t]*#{1,6}[ \t]+.*$/m, '');
  const seen = new Set(), urls = [];
  const add = (raw) => {
    const url = raw.replace(/[.,)\]}"'!?;:]+$/, '');
    const key = urlKey(url);
    if (!url || seen.has(key)) return;
    seen.add(key);
    urls.push(url);
  };
  body = body.replace(/\[[^\]\n]*\]\((https?:\/\/[^)\s]+)\)/g, (_link, url) => { add(url); return ' '; });
  for (const raw of body.match(/https?:\/\/[^\s)<>"']+/g) || []) add(raw);
  return urls;
}

function urlKey(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.host.toLowerCase().replace(/^www\./, '')}${parsed.pathname.replace(/\/+$/, '')}${parsed.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

/** What a link chip shows: the site, without `www.`. */
export function urlHost(url) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * The card lines of a Joplin note body: text lines in plain form and checklist lines with the
 * index of their line in the body, so a tick on the card changes exactly that line.
 */
const TASK_LINE = /^\s*[-*+] \[[ xX]\] /m;

/** A line or table cell as the card shows it: no images, link targets, heading signs or other Markdown marks. */
export function cellPlain(text) {
  return plainPreviewText(text.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<img\b[^>]*>/gi, '').replace(/^\s{0,3}#{1,6}\s+/, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'));
}

// Joplin's rich-text editor saves an empty paragraph and a non-breaking space as &nbsp;, and Markdown shows it as a space.
// The card does the same, except inside `inline code`, where Markdown shows it as typed. Fenced code is left alone by the caller.
const NBSP = /(`+)[^`\n]+?\1|&nbsp;/g;
const spaced = (line) => (line.includes('&nbsp;') ? line.replace(NBSP, (whole) => (whole === '&nbsp;' ? ' ' : whole)) : line);

export function previewLines(body, title = '', max = 12, maxTasks = 5) {
  const out = [];
  const lines = body.split(/\r?\n/);
  const frontmatterEnd = lines[0]?.trim() === '---' ? lines.findIndex((line, i) => i > 0 && line.trim() === '---') : -1;
  const plainTitle = normalizeHeading(title);
  let fence = '';
  let started = false;
  let tasks = 0;
  const limit = TASK_LINE.test(body) ? Infinity : max;
  // A table is one card row: a small real table (JotDrop design opmaak-editor, part 9).
  const tables = new Map(blocks(body).filter((run) => run.kind === 'table').map((run) => [run.fromLine, run.toLine]));
  // Lists in levels (JotDrop design kaarten-en-lijsten, part 7): a task, bullet or numbered line carries its level,
  // 0 to 2 (the card shows 3 levels), instead of its indent; a bullet shows as •.
  const levels = listLevels(body);
  for (let i = 0; i < lines.length && out.length < limit; i++) {
    if (i <= frontmatterEnd) continue;
    const line = fence ? lines[i] : spaced(lines[i]);
    // Joplin notes often repeat their title as a first heading; like JotDrop elsewhere, the card shows it once.
    if (!started && line.trim()) {
      started = true;
      const heading = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
      if (heading && plainTitle && plainTitle.includes(normalizeHeading(heading[1]))) continue;
    }
    const tableEnd = !fence ? tables.get(i) : undefined;
    if (tableEnd !== undefined) {
      const table = parseTable(lines.slice(i, tableEnd + 1).map(spaced));
      // Its text is the table in words, as the card showed it before: cells joined with " · ".
      out.push({ table, text: [table.header, ...table.rows].map((cells) => cells.map((cell) => cellPlain(cellText(cell)).trim()).filter(Boolean).join(' · ')).join('\n') });
      i = tableEnd;
      continue;
    }
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) { if (!fence) fence = marker; else if (marker[0] === fence[0] && marker.length >= fence.length) fence = ''; continue; }
    if (fence) { out.push({ text: line }); continue; }
    const task = /^\s*[-*+] \[([ xX])\] (.*)$/.exec(line);
    const level = Math.min(Math.max(levels[i], 0), 2);
    if (task) {
      if (tasks++ >= maxTasks) break;
      out.push({ line: i, checked: task[1] !== ' ', text: plainPreviewText(task[2]), level }); continue;
    }
    if (!line.trim()) { if (out.length && out[out.length - 1].text !== '') out.push({ text: '' }); continue; }
    const cleaned = line.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<img\b[^>]*>/gi, '');
    if (!cleaned.trim()) continue;
    const prefix = levels[i] >= 0 ? linePrefix(cleaned) : undefined;
    if (prefix?.kind === 'bullet' || prefix?.kind === 'ordered') {
      const sign = prefix.kind === 'bullet' ? '•' : `${prefix.number}${prefix.delimiter}`;
      out.push({ text: `${sign} ${cellPlain(cleaned.slice(prefix.markTo))}`, level }); continue;
    }
    const text = cellPlain(cleaned);
    if (text.trim()) out.push({ text });
  }
  while (out.length && out[out.length - 1].text === '' && out[out.length - 1].line === undefined) out.pop();
  while (out.length && out[0].text === '' && out[0].line === undefined) out.shift();
  return out;
}

function normalizeHeading(text) {
  return plainPreviewText(String(text)).replace(/\s+#+\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
}
