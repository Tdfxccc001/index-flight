import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { B } from '../src/config/balance';
import { initialFlight, fly } from '../src/game/FlightController';
import { hits, boundary } from '../src/game/CollisionSystem';
import { clearanceAt, arrivalTime } from '../src/game/Clearance';
import {
  layoutColumns,
  gapCenters,
  blockadeColumns,
  sharedLowOpenings,
} from '../src/game/RowLayout';
import { Random } from '../src/game/SeededRandom';
import { ScoreSystem } from '../src/game/ScoreSystem';
import { findPath } from '../src/game/SpawnPlanner';
import { forwardSpeed } from '../src/game/DifficultyDirector';
import { advance, type Row } from '../src/game/Obstacles';
import type { Day } from '../src/game/MarketData';
const days: Day[] = JSON.parse(
  fs.readFileSync('public/data/sse_composite_daily.json', 'utf8'),
).records;
const make = (id: number, z = -38): Row => ({
  id,
  z,
  kind: 'normal',
  columns: layoutColumns(
    days.slice((id * 5) % (days.length - 5), ((id * 5) % (days.length - 5)) + 5),
    id,
    50,
    new Random(id + 18),
  ),
  age: 0,
  lateral: 0,
  extraSpeed: 0,
  scored: false,
  top: Infinity,
  side: Infinity,
  gap: false,
});
test('clearance matches composite collision at lane center, wing edge, ground and unequal tops', () => {
  const row = make(0, 0);
  row.columns.forEach((c) => (c.height = 8));
  const x = gapCenters(row)[1];
  for (const dx of [0, 0.25, 0.7, -0.7, 1.2]) {
    const s = { ...initialFlight(), x: x + dx, y: 3 };
    assert.equal(clearanceAt(s, row, 0).safe, !hits(s, s, row, 0, 0));
  }
  row.columns.forEach((c) => (c.height = 3));
  for (const x of [-9, -5, 0, 5, 9]) {
    const s = { ...initialFlight(), x, y: 3.35 };
    assert.equal(clearanceAt(s, row, 0).safe, !hits(s, s, row, 0, 0));
  }
  assert.equal(clearanceAt({ ...initialFlight(), y: 0.2 }, row, 0).safe, false);
});
test('predicted moving clearance never labels a colliding stationary crossing safe', () => {
  const row = make(5, -24);
  row.kind = 'moving';
  row.lateral = 1.1;
  row.columns = Array.from({ length: 5 }, (_, i) => ({
    x: (i - 2) * B.movingPitch,
    width: B.movingWidth,
    height: 8,
    direction: 'down',
  }));
  for (const lateral of [-1.1, 1.1]) {
    row.lateral = lateral;
    let accepted = 0;
    for (let x = -10; x <= 10; x += 0.1) {
      const s = { ...initialFlight(), x, y: 3 };
      const result = clearanceAt(s, row, 120);
      if (!result.safe) continue;
      accepted++;
      const copy = structuredClone(row);
      let time = 120;
      for (let i = 0; i < 200 && copy.z < 3; i++) {
        const speed = forwardSpeed(time);
        assert.equal(hits(s, s, copy, speed, B.dt), false, `moving clearance x=${x}`);
        advance(copy, speed, B.dt);
        time += B.dt;
      }
    }
    assert.ok(accepted > 0);
  }
  assert.ok(arrivalTime(row, 120) > 0);
});
test('layouts bind five ordered days, keep usable openings and sealed edge columns', () => {
  for (let index = 0; index < 200; index++) {
    const row = make(index);
    const c = row.columns;
    assert.equal(c.length, 5);
    assert.ok(Math.abs(c[0].x - c[0].width / 2 + 11) < 1e-9);
    assert.ok(Math.abs(c[4].x + c[4].width / 2 - 11) < 1e-9);
    for (let j = 0; j < 4; j++) {
      const gap = c[j + 1].x - c[j + 1].width / 2 - c[j].x - c[j].width / 2;
      assert.ok(gap >= B.gapWidthMin - 1e-8);
      assert.ok(gap <= B.gapWidthMax + 1e-8);
      assert.ok(c[j].width > 1.4);
      assert.ok(c[j].day!.date < c[j + 1].day!.date);
    }
  }
});
test('alternating ordinary layouts have no permanent low-altitude lane', () => {
  assert.ok(sharedLowOpenings([make(0), make(1)]).length > 0);
  assert.equal(sharedLowOpenings([make(2), make(3)]).length, 0);
  for (let seed = 0; seed < 60; seed++) {
    const rows = [make(seed * 2 + 2, 0), make(seed * 2 + 3, 0)];
    for (let x = -10.3; x <= 10.3; x += 0.025) {
      const s = { ...initialFlight(), x, y: 2 };
      assert.ok(
        rows.some((row) => hits(s, s, row, 0, 0)),
        `fixed lane seed=${seed}, x=${x}`,
      );
    }
  }
});
test('stationary gap and tiny wiggles keep distance points but cannot farm risk or combo', () => {
  for (const amplitude of [0, 0.14, 0.35]) {
    const score = new ScoreSystem();
    let first = 0;
    for (let i = 0; i < 50; i++) {
      const row = make(0, 0);
      row.columns.forEach((c) => (c.height = 8));
      const x = gapCenters(row)[1] + amplitude * Math.sin(i * 2.2);
      const s = { ...initialFlight(), x, y: 3 };
      score.update(10, i * 2);
      score.observe(s, row);
      score.settle(row, i * 2, s);
      if (i === 0) first = score.score;
    }
    assert.equal(score.riskEvents, 1);
    assert.equal(score.combo, 1);
    assert.equal(score.score, first + 49 * 100);
    assert.equal(score.suppressed, 49);
  }
});
test('real changed route earns new risk, same-route large wiggling does not', () => {
  const score = new ScoreSystem();
  for (let i = 0; i < 6; i++) {
    const row = make(i, 0);
    row.columns.forEach((c) => (c.height = 8));
    const x = gapCenters(row)[1];
    const s = { ...initialFlight(), x, y: 3 };
    score.observe(s, row);
    score.settle(row, i * 1.5, s);
  }
  assert.ok(score.riskEvents >= 4);
  assert.ok(score.combo > 1);
  const earned = score.riskEvents;
  const same = make(5, 0);
  for (let i = 0; i < 6; i++) {
    const row = structuredClone(same);
    row.scored = false;
    row.passage = undefined;
    const s = { ...initialFlight(), x: gapCenters(row)[1] + (i % 2 ? 0.38 : -0.38), y: 3 };
    row.columns.forEach((c) => (c.height = 8));
    score.update(0, 10 + i * 2);
    score.observe(s, row);
    score.settle(row, 10 + i * 2, s);
  }
  assert.equal(score.riskEvents, earned);
  assert.equal(score.combo, 1);
});
test('four low segments require a climb everywhere; enough height clears; unsafe energy stays a planner concern', () => {
  const row = make(10, 0);
  row.kind = 'block';
  row.columns = blockadeColumns(B.lanes, 4.8);
  for (let x = -10.3; x <= 10.3; x += 0.1) {
    const s = { ...initialFlight(), x, y: 4.3 };
    assert.equal(hits(s, s, row, 0, 0), true);
    assert.equal(hits({ ...s, y: 5.1 }, { ...s, y: 5.1 }, row, 0, 0), false);
  }
  assert.equal(row.columns.length, 4);
  row.z = -80;
  row.extraSpeed = 8;
  const result = findPath(initialFlight(), [row], 190);
  assert.equal(result.safe, true);
});
test('dynamic-layout certificates replay with new risk rewards across actual dense windows', () => {
  const report = [];
  for (let seed = 0; seed < 24; seed++) {
    const rows = Array.from({ length: 5 }, (_, i) =>
      make(seed * 5 + i, -B.firstRow - i * B.rowSpacing),
    );
    const time = seed * 18,
      result = findPath(initialFlight(), rows, time);
    assert.equal(result.safe, true, `dynamic layout seed=${seed}`);
    let s = initialFlight(),
      t = time;
    const score = new ScoreSystem();
    for (const p of result.path)
      for (let k = 0; k < B.plannerTicks; k++) {
        const speed = forwardSpeed(t),
          next = fly(s, p.control, B.dt);
        assert.equal(boundary(next), false);
        assert.equal(
          rows.some((row) => hits(s, next, row, speed, B.dt)),
          false,
          `replay seed=${seed}`,
        );
        s = next;
        score.update(speed * B.dt, t);
        for (const row of rows) {
          advance(row, speed, B.dt);
          score.observe(s, row);
          if (row.z > 2 && !row.scored) score.settle(row, t, s);
        }
        t += B.dt;
      }
    report.push({
      seed,
      safe: result.safe,
      risks: score.riskEvents,
      combo: score.maxCombo,
      ms: result.durationMs,
    });
  }
  fs.writeFileSync('test-results/dynamic-layouts.json', JSON.stringify(report, null, 2));
  assert.ok(report.some((r) => r.risks >= 3));
});
test('zero input and tiny oscillation bots cannot survive indefinitely in fixed lanes at different heights', () => {
  const report = [];
  for (const x of B.lanes)
    for (const y of [2, 4.3, 6, 9, 11])
      for (const amplitude of [0, 0.15]) {
        const rows = Array.from({ length: 90 }, (_, i) => make(i, -B.firstRow - i * B.rowSpacing));
        let state: ReturnType<typeof initialFlight> = { ...initialFlight(), x, y },
          time = 0;
        const score = new ScoreSystem();
        while (time < 100) {
          const target = x + amplitude * Math.sin(time * 3),
            control = {
              x: amplitude
                ? Math.max(-1, Math.min(1, (target - state.x) * 2.5 - state.vx * 0.6))
                : 0,
              y: 0,
            };
          const next = fly(state, control, B.dt),
            speed = forwardSpeed(time);
          if (boundary(next) || rows.some((row) => hits(state, next, row, speed, B.dt))) break;
          state = next;
          score.update(speed * B.dt, time);
          for (const row of rows) {
            advance(row, speed, B.dt);
            score.observe(state, row);
            if (row.z > 2 && !row.scored) score.settle(row, time, state);
          }
          time += B.dt;
        }
        assert.ok(time < 100, `afk survives x=${x} y=${y} wiggle=${amplitude}`);
        report.push({
          x,
          y,
          amplitude,
          survivalSeconds: time,
          riskEvents: score.riskEvents,
          combo: score.maxCombo,
        });
      }
  fs.writeFileSync('test-results/afk-bots.json', JSON.stringify(report, null, 2));
});
