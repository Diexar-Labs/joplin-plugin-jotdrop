// Joplin's own search language (https://joplinapp.org/help/apps/search/): fields such as title:, body:, tag:, notebook:,
// iscompleted: and type:, "exact phrases" and -exclusions. A search that uses it goes to Joplin as it is typed, so the
// board needs no search screen of its own (forum 51337, 20 Nov). Plain words keep the board's friendlier match: every
// word is a prefix, and the cards on screen answer at once.
const FIELD = /(^|\s)-?(title|body|tag|notebook|created|updated|due|type|iscompleted|latitude|longitude|altitude|resource|sourceurl|id|any):/i;

export function isAdvancedSearch(text) {
  const s = String(text || '');
  return FIELD.test(s) || /"[^"]+"/.test(s) || /(^|\s)-[^\s-]/.test(s);
}
