import { test } from 'node:test';
import assert from 'node:assert/strict';
import { B } from '../src/config/balance';
import { initialFlight } from '../src/game/FlightController';
import { hits, prepareCollision, hitsPrepared, swept } from '../src/game/CollisionSystem';
import { hits as referenceHits, swept as referenceSwept } from './helpers/reference-collision';
import { findPath } from '../src/game/SpawnPlanner';
import { findPath as referencePath } from './helpers/reference-planner';
import { plannerCases } from './helpers/planner-cases';
import { Random } from '../src/game/SeededRandom';

test('optimized planner preserves exact certificates, visited count and end state', () => {
  for (const c of plannerCases()) {
    const { durationMs: _old, ...expected } = referencePath(c.flight, c.rows, c.time, c.held);
    const { durationMs: _new, ...actual } = findPath(c.flight, c.rows, c.time, c.held);
    assert.deepEqual(actual, expected, `seed ${c.seed} (${c.kind})`);
  }
});

test('prepared collision matches old swept geometry at contact, wrap seams and random trajectories', () => {
  const random = new Random(9274),
    row = plannerCases()[1].rows[2];
  for (let i = 0; i < 12000; i++) {
    const a = { ...initialFlight(), x: random.range(-12, 12), y: random.range(0, 16) };
    const b = { ...a, x: a.x + random.range(-2, 2), y: a.y + random.range(-1, 1) };
    row.z = random.range(-3, 3);
    row.age = random.range(0, 100);
    row.lateral = random.range(-5, 5);
    const speed = random.range(10, 70),
      margin = i % 2 ? B.plannerMargin : 0;
    const expected = referenceHits(a, b, row, speed, B.dt, margin);
    assert.equal(hits(a, b, row, speed, B.dt, margin), expected, `sample ${i}`);
    const prepared = prepareCollision(row, speed, B.dt, margin);
    assert.equal(prepared ? hitsPrepared(a, b, prepared) : false, expected);
  }
  for (const x of [0, 1, 1 + 1e-12, -1, -1 - 1e-12]) {
    const a = { x, y: 1, z: -2 },
      b = { x, y: 1, z: 2 },
      half = { x: 1, y: 1, z: 1 };
    assert.equal(swept(a, b, half), referenceSwept(a, b, half));
  }
  // Explicitly cross both wrap seams within a single tick.
  row.z = -0.1;
  for (const lateral of [-4, 4]) {
    row.lateral = lateral;
    row.age = 0;
    row.columns = [
      {
        x: Math.sign(lateral) * (B.movingPitch * 2.5 - 0.01),
        width: 2,
        height: 5,
        direction: 'up',
      },
    ];
    for (const x of [-10, 0, 10]) {
      const a = { ...initialFlight(), x, y: 2 };
      assert.equal(hits(a, a, row, 20, B.dt), referenceHits(a, a, row, 20, B.dt));
    }
  }
});
