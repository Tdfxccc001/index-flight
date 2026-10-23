// Frozen pre-optimization implementation for differential regression tests.
import { B } from '../../src/config/balance';
import type { Flight } from '../../src/game/FlightController';
import { columnX, type Row } from '../../src/game/Obstacles';
export interface Vec {
  x: number;
  y: number;
  z: number;
}
/** Relative swept point versus expanded AABB. Inclusive boundaries mean contact kills. */
export function swept(a: Vec, b: Vec, half: Vec) {
  let lo = 0,
    hi = 1;
  for (const k of ['x', 'y', 'z'] as const) {
    const v = b[k] - a[k];
    if (Math.abs(v) < 1e-9) {
      if (Math.abs(a[k]) > half[k]) return false;
    } else {
      let t1 = (-half[k] - a[k]) / v,
        t2 = (half[k] - a[k]) / v;
      if (t1 > t2) [t1, t2] = [t2, t1];
      lo = Math.max(lo, t1);
      hi = Math.min(hi, t2);
      if (lo > hi) return false;
    }
  }
  return true;
}
export function boundary(s: Flight, margin = 0) {
  return Math.abs(s.x) + B.wing.x + margin >= B.corridor / 2 || s.y - B.body.y - margin <= 0;
}
export function hits(a: Flight, b: Flight, row: Row, speed: number, dt: number, margin = 0) {
  const z0 = row.z,
    z1 = z0 + (speed + row.extraSpeed) * dt;
  if (
    Math.min(z0, z1) > B.body.z + B.thickness / 2 + margin ||
    Math.max(z0, z1) < -B.body.z - B.thickness / 2 - margin
  )
    return false;
  for (const c of row.columns) {
    const x0 = columnX(row, c),
      x1 = columnX(row, c, dt);
    // Wrapped columns cross the seam behind the wall, never sweep across the corridor.
    const segments =
      Math.abs(x1 - x0) > 12
        ? [
            [x0, x0 + row.lateral * dt],
            [x1 - row.lateral * dt, x1],
          ]
        : [[x0, x1]];
    for (const [xa, xb] of segments)
      for (const box of [B.body, B.wing]) {
        if (
          swept(
            { x: a.x - xa, y: a.y - c.height / 2, z: -z0 },
            { x: b.x - xb, y: b.y - c.height / 2, z: -z1 },
            {
              x: c.width / 2 + box.x + margin,
              y: c.height / 2 + box.y + margin,
              z: B.thickness / 2 + box.z + margin,
            },
          )
        )
          return true;
      }
  }
  return false;
}
