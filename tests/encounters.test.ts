import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { B } from '../src/config/balance';
import { composeEncounter, specialCapacity } from '../src/game/EncounterComposer';
import { initialFlight, fly } from '../src/game/FlightController';
import { advance, type Row } from '../src/game/Obstacles';
import { boundary, hits } from '../src/game/CollisionSystem';
import { findPath } from '../src/game/SpawnPlanner';
import { forwardSpeed } from '../src/game/DifficultyDirector';
import { layoutColumns, blockadeColumns } from '../src/game/RowLayout';
import { Random } from '../src/game/SeededRandom';
import type { Market } from '../src/game/MarketData';
const market: Market = JSON.parse(fs.readFileSync('public/data/sse_composite_daily.json', 'utf8'));
function primary(ordinal: number, y = 3): Row {
  return {
    id: 100,
    z: -100,
    kind: ordinal % 2 ? 'block' : 'rush',
    columns:
      ordinal % 2
        ? blockadeColumns(B.lanes, y + B.blockHeadroom)
        : [{ x: -2.375, width: B.rushWidth, height: 7, direction: 'down' }],
    lateral: 0,
    extraSpeed: ordinal % 2 ? 8 : 18,
    age: 0,
    scored: false,
    top: Infinity,
    side: Infinity,
    gap: false,
  };
}
test('late compositions vary lanes, approach timing and fixed heights within the stage budget', () => {
  const s = { ...initialFlight(), x: -2.375, y: 3 };
  for (let ordinal = 0; ordinal < 4; ordinal++) {
    const p = primary(ordinal),
      batch = composeEncounter(p, s, B.lanes, 210, ordinal, 1, () => 101);
    assert.equal(p.encounter, ['slalom', 'stepped', 'crossfire', 'climb-turn'][ordinal]);
    assert.ok(batch.length + 1 <= specialCapacity(210));
    assert.ok(batch.every((r) => r.columns.every((c) => !c.day)));
    if (batch.length === 2) {
      assert.ok(batch[1].z < p.z - 20);
      assert.notEqual(batch[1].columns[0].x, s.x);
    }
    if (p.encounter === 'stepped') {
      assert.ok(new Set(p.columns.map((c) => c.height)).size > 1);
      assert.ok(p.columns.every((c) => c.height > s.y));
    }
  }
  assert.equal(composeEncounter(primary(0), s, B.lanes, 100, 0, 0, () => 101).length, 1);
  assert.equal(composeEncounter(primary(0), s, B.lanes, 210, 0, 2, () => 101).length, 1);
  const normal = { ...primary(0), kind: 'normal' as const };
  assert.equal(composeEncounter(normal, s, B.lanes, 210, 0, 0, () => 101).length, 1);
  const p = primary(3),
    before = p.columns.map((c) => c.height);
  composeEncounter(p, s, B.lanes, 210, 3, 1, () => 101);
  s.y = 5;
  assert.deepEqual(
    p.columns.map((c) => c.height),
    before,
  );
});
test('48 late-pattern historical windows: replay all accepted full batches at 60 Hz', () => {
  const report: unknown[] = [];
  const accepted = [0, 0, 0, 0];
  let rejected = 0;
  for (let seed = 0; seed < 48; seed++) {
    const ordinal = seed % 4,
      time = 210 + seed * 3,
      rng = new Random(seed + 100);
    const start = {
      ...initialFlight(),
      x: seed % 2 ? -2.375 : 2.375,
      y: seed % 3 === 0 ? 2.5 : 3.8,
      energy: seed % 8 === 0 ? 8 : 85,
      load: seed % 9 === 0 ? 2.2 : 0,
    };
    const offset = (seed * 19) % (market.records.length - 25);
    const rows: Row[] = Array.from({ length: 5 }, (_, i) => ({
      id: i,
      z: -B.firstRow - i * B.rowSpacing,
      kind: i === 3 && seed % 3 === 0 ? 'moving' : 'normal',
      columns: layoutColumns(
        market.records.slice(offset + i * 5, offset + i * 5 + 5),
        i + 20,
        time,
        rng,
      ),
      lateral: 0,
      extraSpeed: 0,
      age: 0,
      scored: false,
      top: Infinity,
      side: Infinity,
      gap: false,
    }));
    if (rows[3].kind === 'moving') {
      rows[3].columns.forEach((c, i) => {
        c.x = (i - 2) * B.movingPitch;
        c.width = B.movingWidth;
      });
      rows[3].lateral = seed % 2 ? -1.1 : 1.1;
    }
    const p = primary(ordinal, start.y);
    p.spawnState = { x: start.x, y: start.y };
    p.columns[0].x = ordinal % 2 ? p.columns[0].x : start.x;
    const batch = composeEncounter(
      p,
      start,
      B.lanes,
      time,
      ordinal,
      rows.filter((r) => r.kind === 'moving').length,
      () => 101,
    );
    rows.push(...batch);
    const result = findPath(start, rows, time);
    report.push({
      seed,
      pattern: p.encounter,
      safe: result.safe,
      rows: batch.length,
      ms: Math.round(result.durationMs),
    });
    if (!result.safe) {
      rejected++;
      continue;
    }
    accepted[ordinal]++;
    let s = start,
      t = time;
    for (const part of result.path)
      for (let i = 0; i < Math.round(part.duration / B.dt); i++) {
        const speed = forwardSpeed(t),
          next = fly(s, part.control, B.dt);
        assert.equal(boundary(next), false, `boundary seed ${seed}`);
        assert.equal(
          rows.some((r) => hits(s, next, r, speed, B.dt)),
          false,
          `collision seed ${seed}`,
        );
        rows.forEach((r) => advance(r, speed, B.dt));
        s = next;
        t += B.dt;
      }
  }
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync(
    'test-results/encounters.json',
    JSON.stringify({ accepted, rejected, cases: report }, null, 2),
  );
  assert.ok(
    accepted.every((n) => n >= 3),
    JSON.stringify({ accepted, rejected }),
  );
});
