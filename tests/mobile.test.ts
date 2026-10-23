import test from 'node:test';
import assert from 'node:assert/strict';
import { shapeTouchDrag } from '../src/input/TouchControl';
import { quoteOpacity } from '../src/game/MobilePresentation';
import { initialFlight, fly } from '../src/game/FlightController';
import { B } from '../src/config/balance';
test('touch jitter is neutral, small corrections are progressive, and full throw keeps flight authority', () => {
  const tiny = shapeTouchDrag(2 / B.touchRadius, 1 / B.touchRadius);
  assert.deepEqual(tiny, { x: 0, y: 0 });
  assert.deepEqual(fly(initialFlight(), tiny, B.dt), fly(initialFlight(), { x: 0, y: 0 }, B.dt));
  let last = 0;
  for (let pixels = 4; pixels <= 68; pixels++) {
    const c = shapeTouchDrag(pixels / B.touchRadius, 0);
    assert.ok(c.x >= last && c.x <= 1);
    last = c.x;
  }
  assert.ok(shapeTouchDrag(20 / B.touchRadius, 0).x < 0.25);
  assert.deepEqual(shapeTouchDrag(1, 0), { x: 1, y: 0 });
  const diagonal = shapeTouchDrag(2, -2);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-10);
  assert.deepEqual(
    fly(initialFlight(), shapeTouchDrag(1, 0), B.dt),
    fly(initialFlight(), { x: 1, y: 0 }, B.dt),
  );
});
test('portrait quotes fade monotonically with distance without affecting desktop or market data', () => {
  assert.equal(quoteOpacity(-20, true), 1);
  assert.equal(quoteOpacity(-48, true), 0);
  let last = 1;
  for (let distance = 0; distance < 150; distance++) {
    const a = quoteOpacity(-distance, true);
    assert.ok(a <= last && a >= 0);
    last = a;
    assert.equal(quoteOpacity(-distance, false), 1);
  }
  assert.ok(quoteOpacity(-32, true) > 0.3 && quoteOpacity(-32, true) < 0.7);
});
