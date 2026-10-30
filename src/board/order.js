// The board's own order. Every card has a rank (its creation time until it is dragged); a higher rank is
// further up. A drag normally writes one number on one note, so moving a card syncs as one small change.

const STEP = 1000;

export function sortCards(cards) {
  return [...cards].sort((a, b) => b.rank - a.rank || (a.id < b.id ? -1 : 1));
}

// `list` is the whole group in board order. Returns the [{ id, rank }] to store: empty when nothing moves.
export function planMove(list, movedId, targetId, after) {
  const from = list.findIndex((c) => c.id === movedId);
  const rest = list.filter((c) => c.id !== movedId);
  let at = rest.findIndex((c) => c.id === targetId);
  if (from < 0 || at < 0) return [];
  if (after) at++;
  if (at === from) return [];
  const high = at > 0 ? rest[at - 1].rank : null;
  const low = at < rest.length ? rest[at].rank : null;
  if (high === null) return [{ id: movedId, rank: low + STEP }];
  if (low === null) return [{ id: movedId, rank: high - STEP }];
  const middle = (high + low) / 2;
  if (middle < high && middle > low) return [{ id: movedId, rank: middle }];
  // No number fits (notes imported in the same millisecond): spread only the tied run around the gap.
  let start = at - 1;
  while (start > 0 && rest[start - 1].rank === high) start--;
  let end = at;
  while (end < rest.length - 1 && rest[end + 1].rank === low) end++;
  const run = [...rest.slice(start, at), { id: movedId }, ...rest.slice(at, end + 1)];
  const top = start > 0 ? rest[start - 1].rank : high + STEP * (run.length + 1);
  const bottom = end < rest.length - 1 ? rest[end + 1].rank : low - STEP * (run.length + 1);
  const gap = (top - bottom) / (run.length + 1);
  return run.map((card, i) => ({ id: card.id, rank: top - gap * (i + 1) }));
}
