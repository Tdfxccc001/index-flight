import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { B } from '../src/config/balance';
import { airObstacle, rotationSlot } from '../src/game/AirObstacles';
import { DifficultyDirector, forwardSpeed } from '../src/game/DifficultyDirector';
import { Random } from '../src/game/SeededRandom';
import { columnPose, advance, type Row } from '../src/game/Obstacles';
import { hits, boundary } from '../src/game/CollisionSystem';
import { initialFlight, fly } from '../src/game/FlightController';
import { findPath } from '../src/game/SpawnPlanner';
import { layoutColumns } from '../src/game/RowLayout';
import type { Market } from '../src/game/MarketData';

const day = { date: '2022-01-04', close: 3000, change: -12.34, direction: 'down' as const };
test('beam is a rotated historical column, attached flush to either wall and at least half-width', () => {
  const sides = new Set<number>();
  for (let seed = 0; seed < 100; seed++) {
    const row = airObstacle('beam', seed, 30, new Random(seed), day),
      c = row.columns[0];
    assert.ok(c.height >= B.corridor / 2 && c.height <= B.corridor);
    assert.ok(Math.abs(Math.abs(c.x) + c.height / 2 - B.corridor / 2) < 1e-10);
    assert.equal(columnPose(row, c).angle, Math.PI / 2);
    assert.equal(c.quoteDay, day);
    assert.ok(row.extraSpeed > 0);
    assert.ok(c.centerY! - c.width / 2 > 0);
    sides.add(Math.sign(c.x));
  }
  assert.equal(sides.size, 2);
});
test('rotors span 0.6 to 1.2 corridor widths, can cross ground/sky and keep a modest fixed spawn speed', () => {
  let crossesGround = false;
  let crossesSky = false;
  for (let seed = 0; seed < 100; seed++) {
    const slow = airObstacle('rotor', seed, 55, new Random(seed), day);
    const fast = airObstacle('rotor', seed, 90, new Random(seed), day);
    const c = slow.columns[0];
    assert.equal(c.x, 0);
    assert.ok(c.centerY! < B.ceiling / 2);
    assert.ok(c.height >= B.corridor * 0.6 && c.height <= B.corridor * 1.2);
    if (c.height / 2 > c.centerY!) crossesGround = true;
    if (c.centerY! + c.height / 2 > B.ceiling) crossesSky = true;
    assert.equal(slow.extraSpeed, 0);
    assert.equal(Math.abs(slow.angularSpeed!), B.rotorSpeed);
    assert.equal(Math.abs(fast.angularSpeed!), B.rotorFastSpeed);
    assert.ok(
      Math.abs(columnPose(slow, c, 1).angle - columnPose(slow, c).angle - slow.angularSpeed!) <
        1e-10,
    );
  }
  assert.ok(crossesGround);
  assert.ok(crossesSky);
});
test('rotor slot shifts later history by one row and preserves dates and independent rush positions', () => {
  const rows: Row[] = [-38, -54, -70, -86, -102].map((z, id) => ({
    ...airObstacle('rotor', id, 55, new Random(id), day),
    kind: 'normal',
    z,
  }));
  rows.push({ ...airObstacle('beam', 9, 55, new Random(9), day), z: -90 });
  const slot = rotationSlot(rows)!;
  assert.equal(slot.z, -70);
  assert.deepEqual(slot.shiftedIds, [2, 3, 4]);
  assert.deepEqual(
    rows.map((r) => r.z),
    [-38, -54, -70, -86, -102, -90],
  );
});
test('air collision respects rotated surfaces, empty space below, corners and high-speed sweeps', () => {
  const row = airObstacle('beam', 1, 30, new Random(2), day);
  row.z = 0;
  const c = row.columns[0];
  const s = { ...initialFlight(), x: c.x, y: c.centerY! };
  assert.equal(hits(s, s, row, 0, 0), true);
  const below = { ...s, y: c.centerY! - c.width / 2 - 0.8 };
  assert.equal(hits(below, below, row, 0, 0), false);
  row.z = -10;
  assert.equal(hits(s, s, row, 1200, B.dt), true);
  // Safe point inside the diagonal's bounding box but well outside the actual column.
  c.angle = Math.PI / 4;
  c.centerY = 5;
  c.x = 0;
  c.width = 1;
  c.height = 8;
  row.z = 0;
  assert.equal(hits({ ...s, x: 2.2, y: 7.2 }, { ...s, x: 2.2, y: 7.2 }, row, 0, 0), false);
  assert.equal(hits({ ...s, x: -2, y: 7 }, { ...s, x: -2, y: 7 }, row, 0, 0), true);
});
test('new unlock thresholds and local zero-second mode keep cooldown and active capacity', () => {
  assert.equal(B.blockUnlock, 40);
  const seen = new Set<string>();
  for (let seed = 0; seed < 300; seed++) {
    const d = new DifficultyDirector(new Random(seed), true);
    const kind = d.choose(0, 0, seed % 4 === 0);
    seen.add(kind);
    if (kind !== 'normal') assert.equal(d.choose(0.1, 0, false), 'normal');
    assert.equal(new DifficultyDirector(new Random(seed), true).choose(0, 1, false), 'normal');
    for (const t of [0, 12, 28, 29.9, 30, 39.9, 40, 54.9, 55]) {
      const actual = new DifficultyDirector(new Random(seed)).choose(t, 0, false);
      if (actual === 'beam') assert.ok(t >= 30);
      if (actual === 'block') assert.ok(t >= 40);
      if (actual === 'rotor') assert.ok(t >= 55);
    }
  }
  for (const kind of ['moving', 'rush', 'block', 'beam', 'rotor']) assert.ok(seen.has(kind));
});
test('planner certificates for beams and rotors replay without collision at 60Hz', () => {
  for (const kind of ['beam', 'rotor'] as const) {
    let accepted = 0;
    for (let seed = 0; seed < 8; seed++) {
      const row = airObstacle(kind, seed, 100, new Random(seed), day);
      row.z = -65;
      let s = initialFlight(),
        time = 100;
      const result = findPath(s, [row], time);
      if (!result.safe) continue;
      accepted++;
      for (const point of result.path)
        for (let i = 0; i < Math.round(point.duration / B.dt); i++) {
          const next = fly(s, point.control, B.dt),
            speed = forwardSpeed(time);
          assert.equal(boundary(next), false);
          assert.equal(hits(s, next, row, speed, B.dt), false, `${kind} seed ${seed}`);
          advance(row, speed, B.dt);
          s = next;
          time += B.dt;
        }
    }
    assert.ok(accepted >= 4, `${kind}: ${accepted}/8 accepted`);
  }
});

test('mixed historical, moving, beam and inserted rotor courses replay every accepted path', () => {
  const market: Market = JSON.parse(readFileSync('public/data/sse_composite_daily.json', 'utf8'));
  let accepted = 0;
  for (let seed = 0; seed < 24; seed++) {
    const time = seed < 12 ? 60 : 100,
      random = new Random(seed + 80);
    const rows: Row[] = Array.from({ length: 5 }, (_, i) => ({
      id: i,
      kind: i === 3 && seed % 2 ? 'moving' : 'normal',
      z: -38 - i * B.rowSpacing,
      columns: layoutColumns(
        market.records.slice(seed * 7 + i * 5, seed * 7 + i * 5 + 5),
        i + 20,
        time,
        random,
      ),
      lateral: i === 3 && seed % 2 ? 0.9 : 0,
      extraSpeed: 0,
      age: 0,
      scored: false,
      top: Infinity,
      side: Infinity,
      gap: false,
    }));
    if (rows[3].kind === 'moving')
      rows[3].columns.forEach((c, i) => {
        c.x = (i - 2) * B.movingPitch;
        c.width = B.movingWidth;
      });
    const slot = rotationSlot(rows)!;
    rows.forEach((r) => {
      if (slot.shiftedIds.includes(r.id)) r.z -= B.rowSpacing;
    });
    const rotor = airObstacle('rotor', 10, time, random, market.records[seed]);
    rotor.z = slot.z;
    rows.push(rotor);
    if (seed % 3 === 0) rows.push(airObstacle('beam', 11, time, random, market.records[seed + 1]));
    let s = { ...initialFlight(), x: seed % 2 ? -2.375 : 2.375, energy: seed % 5 ? 100 : 25 };
    const result = findPath(s, rows, time);
    if (!result.safe) continue;
    accepted++;
    let now = time;
    for (const point of result.path)
      for (let tick = 0; tick < Math.round(point.duration / B.dt); tick++) {
        const next = fly(s, point.control, B.dt),
          speed = forwardSpeed(now);
        assert.equal(boundary(next), false);
        for (const row of rows) {
          assert.equal(hits(s, next, row, speed, B.dt), false, `seed ${seed}, row ${row.kind}`);
          advance(row, speed, B.dt);
        }
        s = next;
        now += B.dt;
      }
  }
  assert.ok(accepted >= 6, `${accepted}/24 mixed courses accepted`);
});
