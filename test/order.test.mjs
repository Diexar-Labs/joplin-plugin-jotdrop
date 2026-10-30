import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planMove, sortCards } from '../src/board/order.js';

const cards = (...ranks) => ranks.map((rank, i) => ({ id: `n${i}`, rank }));

function apply(list, writes) {
  const ranks = new Map(writes.map((w) => [w.id, w.rank]));
  return sortCards(list.map((c) => ({ ...c, rank: ranks.has(c.id) ? ranks.get(c.id) : c.rank }))).map((c) => c.id);
}

test('highest rank first, id settles a tie', () => {
  assert.deepEqual(sortCards([{ id: 'b', rank: 1 }, { id: 'a', rank: 1 }, { id: 'c', rank: 2 }]).map((c) => c.id), ['c', 'a', 'b']);
});

test('a move between two cards writes only the moved card', () => {
  const list = cards(40, 30, 20, 10);
  const writes = planMove(list, 'n3', 'n1', false);
  assert.deepEqual(writes, [{ id: 'n3', rank: 35 }]);
  assert.deepEqual(apply(list, writes), ['n0', 'n3', 'n1', 'n2']);
});

test('to the very top and the very bottom', () => {
  const list = cards(40, 30, 20);
  assert.deepEqual(apply(list, planMove(list, 'n2', 'n0', false)), ['n2', 'n0', 'n1']);
  assert.deepEqual(apply(list, planMove(list, 'n0', 'n2', true)), ['n1', 'n2', 'n0']);
});

test('dropping a card where it already is changes nothing', () => {
  const list = cards(40, 30, 20);
  assert.deepEqual(planMove(list, 'n1', 'n2', false), []);
  assert.deepEqual(planMove(list, 'n1', 'n0', true), []);
});

test('notes with the same rank: only the tied run is renumbered', () => {
  const list = [{ id: 'a', rank: 50 }, { id: 'b', rank: 20 }, { id: 'c', rank: 20 }, { id: 'd', rank: 20 }, { id: 'e', rank: 5 }];
  const writes = planMove(list, 'e', 'c', false);
  assert.deepEqual(apply(list, writes), ['a', 'b', 'e', 'c', 'd']);
  assert.ok(!writes.some((w) => w.id === 'a'), 'the note above the tied run keeps its rank');
});

test('a tie at the very top still has room', () => {
  const list = [{ id: 'a', rank: 20 }, { id: 'b', rank: 20 }, { id: 'c', rank: 20 }];
  assert.deepEqual(apply(list, planMove(list, 'c', 'b', false)), ['a', 'c', 'b']);
});

test('repeated moves into the same gap keep working', () => {
  let list = cards(1793000000001, 1793000000000, 1000);
  for (let i = 0; i < 200; i++) {
    const last = sortCards(list).at(-1).id;
    const writes = planMove(sortCards(list), last, sortCards(list)[1].id, false);
    const ranks = new Map(writes.map((w) => [w.id, w.rank]));
    list = list.map((c) => ({ ...c, rank: ranks.has(c.id) ? ranks.get(c.id) : c.rank }));
    assert.equal(sortCards(list)[1].id, last, `move ${i}`);
  }
});

test('unknown cards do nothing', () => {
  assert.deepEqual(planMove(cards(2, 1), 'x', 'n0', false), []);
  assert.deepEqual(planMove(cards(2, 1), 'n0', 'x', false), []);
});
