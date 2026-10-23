import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crossedMarketDay } from '../src/game/CurrentMarket';
import { wrap, type Row } from '../src/game/Obstacles';
import type { Day } from '../src/game/MarketData';
const days: Day[] = [
  { date: '2022-01-04', close: 3632.33, change: -7.45, direction: 'down' },
  { date: '2022-01-05', close: 3595.18, change: -37.15, direction: 'down' },
];
function row(): Row {
  return {
    id: 1,
    z: 0.1,
    kind: 'normal',
    columns: days.map((day, i) => ({
      x: i ? 4 : -4,
      width: 2,
      height: 5,
      direction: day.direction,
      day,
    })),
    lateral: 0,
    extraSpeed: 0,
    age: 1,
    scored: false,
    top: Infinity,
    side: Infinity,
    gap: false,
  };
}
test('quote uses nearest dated column at interpolated crossing, with deterministic ties', () => {
  const r = row();
  assert.equal(crossedMarketDay(r, -0.1, -3, -1, 0.02), days[0]);
  assert.equal(crossedMarketDay(r, -0.1, 1, 3, 0.02), days[1]);
  assert.equal(crossedMarketDay(r, -0.1, -2, 2, 0.02), days[0]);
});
test('quote respects moving wrap position at crossing instead of original column lane', () => {
  const r = row();
  r.kind = 'moving';
  r.lateral = 12;
  const x = wrap(r.columns[0].x + 0.99 * r.lateral);
  assert.equal(crossedMarketDay(r, -0.1, x, x, 0.02), days[0]);
});
test('quote updates once at crossing; special and undated columns never invent market data', () => {
  const r = row();
  assert.equal(crossedMarketDay(r, 0.05, 0, 0, 0.02), undefined);
  r.z = -0.01;
  assert.equal(crossedMarketDay(r, -0.2, 0, 0, 0.02), undefined);
  r.z = 0.1;
  r.kind = 'rush';
  assert.equal(crossedMarketDay(r, -0.1, 0, 0, 0.02), undefined);
  r.kind = 'normal';
  r.columns.forEach((c) => {
    delete c.day;
  });
  assert.equal(crossedMarketDay(r, -0.1, 0, 0, 0.02), undefined);
});
