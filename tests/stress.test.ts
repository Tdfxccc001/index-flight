import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { B } from '../src/config/balance';
import { fly, initialFlight } from '../src/game/FlightController';
import { hits, boundary } from '../src/game/CollisionSystem';
import { columnHeight, type Day } from '../src/game/MarketData';
import { findPath } from '../src/game/SpawnPlanner';
import { Random } from '../src/game/SeededRandom';
import { advance, type Row } from '../src/game/Obstacles';
import { forwardSpeed } from '../src/game/DifficultyDirector';
import { layoutColumns, blockadeColumns } from '../src/game/RowLayout';
test('80 varied historical windows, moving/rush/block combinations and energy states: replay every accepted certificate', () => {
  const days: Day[] = JSON.parse(
    fs.readFileSync('public/data/sse_composite_daily.json', 'utf8'),
  ).records;
  const report = [];
  const counts = { normal: 0, moving: 0, rush: 0, block: 0, rejected: 0 };
  for (let seed = 1; seed <= 80; seed++) {
    const rng = new Random(seed * 527);
    const time = seed * 7;
    const offset = rng.int(days.length - 25);
    const type = (['normal', 'moving', 'rush', 'block'] as const)[seed % 4];
    const rows: Row[] = [];
    for (let i = 0; i < 5; i++) {
      const moving = i === 2 && type === 'moving';
      rows.push({
        id: i,
        z: -B.firstRow - i * B.rowSpacing,
        kind: moving ? 'moving' : 'normal',
        columns: layoutColumns(
          days.slice(offset + i * 5, offset + i * 5 + 5),
          seed * 5 + i,
          time,
          rng,
        ).map((c, j) => (moving ? { ...c, x: (j - 2) * B.movingPitch, width: B.movingWidth } : c)),
        lateral: moving ? rng.range(0.5, 1.3) : 0,
        extraSpeed: 0,
        age: rng.range(0, 4),
        scored: false,
        top: Infinity,
        side: Infinity,
        gap: false,
      });
    }
    const start = {
      ...initialFlight(),
      energy: seed % 7 === 0 ? 5 : 70,
      load: seed % 5 === 0 ? 2.1 : 0,
      y: seed % 3 === 0 ? 3 : 4.3,
    };
    if (type === 'rush' || type === 'block')
      rows.push({
        id: 99,
        z: -85,
        kind: type,
        columns:
          type === 'block'
            ? blockadeColumns(B.lanes, start.y + B.blockHeadroom)
            : [2.375].map((x) => ({
                x,
                width: 2.05,
                height: 7,
                direction: 'down',
              })),
        lateral: 0,
        extraSpeed: 12,
        age: 0,
        scored: false,
        top: Infinity,
        side: Infinity,
        gap: false,
      });
    const result = findPath(start, rows, time);
    report.push({
      seed,
      type,
      offset,
      safe: result.safe,
      ms: Math.round(result.durationMs),
      visited: result.visited,
    });
    if (!result.safe) {
      counts.rejected++;
      continue;
    }
    counts[type]++;
    let state = start,
      t = time;
    for (const p of result.path)
      for (let i = 0; i < 8; i++) {
        const speed = forwardSpeed(t),
          next = fly(state, p.control, B.dt);
        assert.equal(boundary(next), false, `boundary seed ${seed}`);
        assert.equal(
          rows.some((row) => hits(state, next, row, speed, B.dt)),
          false,
          `collision seed ${seed}`,
        );
        rows.forEach((row) => advance(row, speed, B.dt));
        state = next;
        t += B.dt;
      }
  }
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync(
    'test-results/planner-stress.json',
    JSON.stringify({ counts, cases: report }, null, 2),
  );
  assert.ok(counts.normal >= 10);
  assert.ok(counts.moving >= 5);
  assert.ok(counts.rush >= 5);
  assert.ok(counts.block >= 5);
});
