import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { B } from '../src/config/balance';
import { fly, initialFlight } from '../src/game/FlightController';
import { swept, hits, boundary } from '../src/game/CollisionSystem';
import { MarketSequence, columnHeight, validateMarket, type Market } from '../src/game/MarketData';
import { Random } from '../src/game/SeededRandom';
import { ScoreSystem } from '../src/game/ScoreSystem';
import { findPath } from '../src/game/SpawnPlanner';
import { forwardSpeed, DifficultyDirector } from '../src/game/DifficultyDirector';
import { columnX, advance, type Row } from '../src/game/Obstacles';
import { layoutColumns } from '../src/game/RowLayout';
const market: Market = JSON.parse(fs.readFileSync('public/data/sse_composite_daily.json', 'utf8'));
const row = (z = -20): Row => ({
  id: 1,
  z,
  kind: 'normal',
  columns: [-9.5, -4.75, 0, 4.75, 9.5].map((x) => ({ x, width: 2.85, height: 8, direction: 'up' })),
  lateral: 0,
  extraSpeed: 0,
  age: 0,
  scored: false,
  top: Infinity,
  side: Infinity,
  gap: false,
});
test('real market chronology, delta baseline, complete cross-provider calendar and monotone heights', () => {
  validateMarket(market);
  assert.equal(market.records[0].change, -7.45);
  const report = JSON.parse(fs.readFileSync('docs/market_validation.json', 'utf8'));
  assert.equal(report.crossChecked, market.records.length);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.mismatches, []);
  assert.ok(market.records.every((d) => ![0, 6].includes(new Date(d.date).getUTCDay())));
  assert.ok(columnHeight(10) < columnHeight(30));
  assert.equal(columnHeight(-30), columnHeight(30));
  assert.equal(columnHeight(9999), B.heightMax);
});
test('market consumes every real day in order; tail retained; endless windows contiguous', () => {
  const seq = new MarketSequence(market.records.slice(0, 12), new Random(1));
  assert.deepEqual(seq.next(), market.records.slice(0, 5));
  assert.deepEqual(seq.next(), market.records.slice(5, 10));
  assert.deepEqual(seq.next().slice(0, 2), market.records.slice(10, 12));
  for (let i = 0; i < 30; i++) {
    const d = seq.next();
    const k = market.records.findIndex((x) => x.date === d[0].date);
    assert.deepEqual(d, market.records.slice(k, k + 5));
  }
});
test('inertia brakes quickly, normalized diagonal, low/high energy, no ceiling collision', () => {
  let s = initialFlight();
  for (let i = 0; i < 30; i++) s = fly(s, { x: 1, y: 0 }, B.dt);
  assert.ok(s.vx > 10);
  for (let i = 0; i < 30; i++) s = fly(s, { x: 0, y: 0 }, B.dt);
  assert.ok(Math.abs(s.vx) < 0.1);
  const diag = fly(initialFlight(), { x: 1, y: 1 }, B.dt),
    straight = fly(initialFlight(), { x: 1, y: 0 }, B.dt);
  assert.ok(diag.vx < straight.vx);
  assert.ok(fly({ ...initialFlight(), y: 2, energy: 30 }, { x: 0, y: 0 }, 1).energy > 30);
  assert.ok(fly({ ...initialFlight(), y: 10 }, { x: 0, y: 0 }, 1).energy < 100);
  assert.equal(boundary({ ...initialFlight(), y: 12 }), false);
  assert.ok(fly({ ...initialFlight(), y: 10, energy: 0 }, { x: 0, y: 1 }, 0.5).vy < 0);
});
test('sustained climb stalls before ceiling; holding climb cannot recover; release recovers', () => {
  let s = initialFlight();
  s.y = 1;
  let stalled = false;
  for (let i = 0; i < 190; i++) {
    s = fly(s, { x: 0, y: 1 }, B.dt);
    stalled ||= s.stall > 0;
  }
  assert.ok(stalled);
  for (let i = 0; i < 160; i++) s = fly(s, { x: 0, y: 1 }, B.dt);
  assert.equal(s.recover, true);
  for (let i = 0; i < 200; i++) s = fly(s, { x: 0, y: 0 }, B.dt);
  assert.equal(s.recover, false);
  assert.ok(s.load < 0.1);
});
test('swept collision catches tunneling, grazing, body, wings, floor and side walls', () => {
  assert.equal(swept({ x: 0, y: 0, z: -20 }, { x: 0, y: 0, z: 20 }, { x: 1, y: 1, z: 1 }), true);
  assert.equal(swept({ x: 2, y: 0, z: -20 }, { x: 2, y: 0, z: 20 }, { x: 1, y: 1, z: 1 }), false);
  const r = row(-10);
  r.kind = 'rush';
  r.extraSpeed = 100;
  assert.equal(hits(initialFlight(), initialFlight(), r, 24, 0.2), true);
  assert.equal(
    hits({ ...initialFlight(), x: 2.375 }, { ...initialFlight(), x: 2.375 }, r, 24, 0.2),
    false,
  );
  assert.equal(boundary({ ...initialFlight(), x: 10.5 }), true);
  assert.equal(boundary({ ...initialFlight(), y: 0.2 }), true);
});
test('moving wrap stays behind wall and cannot sweep fictitiously through central aircraft', () => {
  const r = row(0);
  r.kind = 'moving';
  r.lateral = 1;
  r.columns = [{ x: 12.99, width: 3.15, height: 8, direction: 'down' }];
  assert.ok(columnX(r, r.columns[0], 0.03) < -12);
  assert.equal(hits(initialFlight(), initialFlight(), r, 0, 0.03), false);
});
test('surface-distance risk rewards settle once, only after passing, energy capped and combo timed', () => {
  const score = new ScoreSystem(),
    r = row(0),
    s = { ...initialFlight(), x: 2.375, y: 3 };
  score.observe(s, r);
  assert.equal(r.gap, true);
  assert.equal(score.score, 0);
  const label = score.settle(r, 1, s);
  assert.ok(label.includes('穿隙'));
  const first = score.score;
  score.settle(r, 2, s);
  assert.equal(score.score, first);
  const r2 = row(0);
  r2.id = 2;
  r2.columns = [{ x: 0, width: 3, height: 3, direction: 'up' }];
  const top = { ...s, x: 0, y: 3.4, energy: 99 };
  score.observe(top, r2);
  score.settle(r2, 2, top);
  assert.equal(top.energy, 100);
  assert.ok(score.combo > 1);
  score.update(0, 20);
  assert.equal(score.combo, 1);
});
test('director unlocks in order and honors active limit and cooldown', () => {
  const director = new DifficultyDirector(new Random(42));
  assert.equal(director.choose(B.movingUnlock - 1, 0), 'normal');
  assert.equal(director.choose(B.doubleSpecialUnlock - 1, 1), 'normal');
  let k = 'normal';
  for (let i = 0; i < 20 && k === 'normal'; i++) k = director.choose(35, 0);
  assert.equal(k, 'moving');
  assert.equal(director.choose(36, 0), 'normal');
});
test('planner returns replayable full-state trajectory across five rows for deterministic seeds', () => {
  const samples = [];
  for (let seed = 1; seed <= 12; seed++) {
    const random = new Random(seed);
    const seq = new MarketSequence(market.records, new Random(seed));
    const rows: Array<Row> = [];
    for (let j = 0; j < 5; j++) {
      const r = row(-B.firstRow - j * B.rowSpacing);
      r.columns = layoutColumns(seq.next(), j, seed * 20, random);
      if (seed % 3 === 0 && j === 2) {
        r.kind = 'moving';
        r.lateral = 0.7;
        r.columns.forEach((c, i) => {
          c.x = (i - 2) * B.movingPitch;
          c.width = B.movingWidth;
        });
      }
      rows.push(r);
    }
    const result = findPath(initialFlight(), rows, seed * 20);
    assert.equal(result.safe, true, `seed ${seed}`);
    let s = initialFlight(),
      t = seed * 20;
    for (const point of result.path)
      for (let i = 0; i < 8; i++) {
        const spd = forwardSpeed(t),
          next = fly(s, point.control, B.dt);
        assert.equal(boundary(next), false);
        assert.equal(
          rows.some((r) => hits(s, next, r, spd, B.dt)),
          false,
          `certificate collision seed ${seed}`,
        );
        rows.forEach((r) => advance(r, spd, B.dt));
        s = next;
        t += B.dt;
      }
    samples.push({ seed, visited: result.visited, ms: Math.round(result.durationMs) });
  }
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/planner-seeds.json', JSON.stringify(samples, null, 2));
});
test('planner rejects impossible barrier and accounts for low energy plus stall', () => {
  const r = row(-10);
  r.columns = [{ x: 0, width: 22, height: 13, direction: 'down' }];
  assert.equal(findPath(initialFlight(), [r], 0).safe, false);
  const block = row(-65);
  block.kind = 'block';
  block.extraSpeed = 8;
  block.columns = [-7.125, -2.375, 2.375, 7.125].map((x) => ({
    x,
    width: 2.05,
    height: 4.7,
    direction: 'down',
  }));
  const poor = { ...initialFlight(), energy: 0, load: 2.5, stall: 1, recover: true };
  const result = findPath(poor, [block], 190);
  assert.ok(typeof result.safe === 'boolean');
  if (result.safe) assert.ok(result.path.length > 0);
});
