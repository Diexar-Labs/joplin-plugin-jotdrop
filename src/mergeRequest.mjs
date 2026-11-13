// "Merge with AI" (from Find duplicates): both notes go along and the AI writes one text, which the usual confirmation
// (+ and -) puts in the newer note. Notes are named by id only: a title is data, never part of the request. The same
// words as mergeRequest in JotDrop's cloud/web/app.js; scripts/check-shared.mjs compares them.
export function mergeRequest({ older, newer }) {
  return `Two notes may be duplicates. The older one has id ${older.id}, the newer one has id ${newer.id}. Write one text that keeps everything from both notes and does not repeat itself, in the language of the notes. Replace the text of the newer note (id ${newer.id}) with that text. Do not change the older note.`;
}
