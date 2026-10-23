import test from 'node:test';
import assert from 'node:assert/strict';
import { nextMarketRowZ, needsMarketRow, marketTailZ } from '../src/game/RowSpacing';
import { B } from '../src/config/balance';
import type { Row } from '../src/game/Obstacles';
const row = (z: number, kind: Row['kind'] = 'normal'): Row => ({
  id: 1,
  z,
  kind,
  columns: [],
  lateral: 0,
  extraSpeed: 0,
  age: 0,
  scored: false,
  top: Infinity,
  side: Infinity,
  gap: false,
});
test('ordinary refill is not delayed or pushed back by distant incoming companions', () => {
  const rows = [row(-62), row(-80), row(-96, 'moving')];
  const distant = [...rows, row(-150, 'rush'), row(-180, 'block')];
  assert.equal(needsMarketRow(distant), true);
  assert.equal(marketTailZ(distant), -96);
  assert.equal(nextMarketRowZ(distant), -96 - B.rowSpacing);
  assert.equal(nextMarketRowZ(distant), nextMarketRowZ(rows));
});
test('late polling, travel and fixed worker commit delay never stretch the forward row pitch', () => {
  for (const tail of [-105, -99, -90, -75])
    for (const travel of [0, 7, 19]) {
      const rows = [row(tail + 16), row(tail, 'moving')],
        candidate = row(nextMarketRowZ(rows));
      rows.forEach((r) => (r.z += travel));
      candidate.z += travel;
      assert.equal(marketTailZ(rows)! - candidate.z, B.rowSpacing);
    }
  assert.equal(nextMarketRowZ([]), -B.firstRow);
  assert.equal(needsMarketRow([row(-180, 'rush')]), true);
});

test('refill scheduler can sustain 16-unit rows even at the maximum flight speed', () => {
  assert.ok(B.spawnCommitDelay + B.spawnPoll + B.dt < B.rowSpacing / B.maxSpeed);
});
