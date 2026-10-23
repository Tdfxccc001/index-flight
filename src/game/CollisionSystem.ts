import { B } from '../config/balance';
import type { Flight } from './FlightController';
import { columnX, columnPose, type Row } from './Obstacles';
export interface Vec {
  x: number;
  y: number;
  z: number;
}
/** Relative swept point versus expanded AABB. Inclusive boundaries mean contact kills. */
export function swept(a: Vec, b: Vec, half: Vec) {
  return sweptNumbers(a.x, a.y, a.z, b.x, b.y, b.z, half.x, half.y, half.z);
}
function sweptNumbers(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  hx: number,
  hy: number,
  hz: number,
) {
  let lo = 0,
    hi = 1;
  for (let axis = 0; axis < 3; axis++) {
    const a = axis === 0 ? ax : axis === 1 ? ay : az;
    const b = axis === 0 ? bx : axis === 1 ? by : bz;
    const half = axis === 0 ? hx : axis === 1 ? hy : hz;
    const v = b - a;
    if (Math.abs(v) < 1e-9) {
      if (Math.abs(a) > half) return false;
    } else {
      let t1 = (-half - a) / v,
        t2 = (half - a) / v;
      if (t1 > t2) {
        const swap = t1;
        t1 = t2;
        t2 = swap;
      }
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
/** Geometry independent of the candidate flight, shared by all search branches.
 * Each six-number box is [startX, endX, centerY, halfX, halfY, halfZ]. */
export interface PreparedCollision {
  z0: number;
  z1: number;
  boxes: number[];
  oriented?: number[];
}
export function prepareCollision(
  row: Row,
  speed: number,
  dt: number,
  margin = 0,
  result: PreparedCollision = { z0: 0, z1: 0, boxes: [] },
): PreparedCollision | undefined {
  const z0 = row.z,
    z1 = z0 + (speed + row.extraSpeed) * dt;
  if (
    Math.min(z0, z1) > B.body.z + B.thickness / 2 + margin ||
    Math.max(z0, z1) < -B.body.z - B.thickness / 2 - margin
  )
    return undefined;
  result.z0 = z0;
  result.z1 = z1;
  const boxes = result.boxes;
  boxes.length = 0;
  if (result.oriented) result.oriented.length = 0;
  for (const c of row.columns) {
    if (c.centerY !== undefined || c.angle !== undefined) {
      const pose = columnPose(row, c, dt / 2);
      const angularDelta = Math.abs(((row.angularSpeed ?? 0) * dt) / 2);
      // Envelope every intermediate orientation, not just the two tick endpoints.
      const pad =
        2 * Math.hypot(c.width / 2, c.height / 2) * Math.sin(Math.min(Math.PI, angularDelta) / 2) +
        margin;
      (result.oriented ??= []).push(
        pose.x,
        pose.y,
        Math.cos(pose.angle),
        Math.sin(pose.angle),
        c.width / 2 + pad,
        c.height / 2 + pad,
        B.thickness / 2 + margin,
      );
      continue;
    }
    const x0 = columnX(row, c),
      x1 = columnX(row, c, dt);
    // Wrapped columns cross the seam behind the wall, never sweep across the corridor.
    const wrapped = Math.abs(x1 - x0) > 12;
    for (let segment = 0; segment < (wrapped ? 2 : 1); segment++) {
      const xa = wrapped && segment === 1 ? x1 - row.lateral * dt : x0;
      const xb = wrapped && segment === 0 ? x0 + row.lateral * dt : x1;
      for (let i = 0; i < 2; i++) {
        const box = i === 0 ? B.body : B.wing;
        boxes.push(
          xa,
          xb,
          c.height / 2,
          c.width / 2 + box.x + margin,
          c.height / 2 + box.y + margin,
          B.thickness / 2 + box.z + margin,
        );
      }
    }
  }
  return result;
}
export function hitsPrepared(a: Flight, b: Flight, prepared: PreparedCollision) {
  const oriented = prepared.oriented;
  if (oriented)
    for (let i = 0; i < oriented.length; i += 7) {
      const cx = oriented[i],
        cy = oriented[i + 1],
        co = oriented[i + 2],
        si = oriented[i + 3];
      const hw = oriented[i + 4],
        hh = oriented[i + 5];
      for (const box of [B.body, B.wing]) {
        let lo = 0,
          hi = 1;
        // Continuous SAT: world axes, obstacle axes and depth. All must overlap at
        // the SAME instant; an enclosing AABB alone would kill safe diagonal passes.
        for (let axis = 0; axis < 5; axis++) {
          const ux = axis === 0 ? 1 : axis === 2 ? co : axis === 3 ? -si : 0;
          const uy = axis === 1 ? 1 : axis === 2 ? si : axis === 3 ? co : 0;
          const p = axis === 4 ? -prepared.z0 : (a.x - cx) * ux + (a.y - cy) * uy;
          const q = axis === 4 ? -prepared.z1 : (b.x - cx) * ux + (b.y - cy) * uy;
          const half =
            axis === 4
              ? oriented[i + 6] + box.z
              : hw * Math.abs(ux * co + uy * si) +
                hh * Math.abs(-ux * si + uy * co) +
                box.x * Math.abs(ux) +
                box.y * Math.abs(uy);
          const v = q - p;
          if (Math.abs(v) < 1e-9) {
            if (Math.abs(p) > half) {
              hi = -1;
              break;
            }
          } else {
            const t0 = (-half - p) / v,
              t1 = (half - p) / v;
            lo = Math.max(lo, Math.min(t0, t1));
            hi = Math.min(hi, Math.max(t0, t1));
            if (lo > hi) break;
          }
        }
        if (lo <= hi) return true;
      }
    }
  const boxes = prepared.boxes;
  for (let i = 0; i < boxes.length; i += 6)
    if (
      sweptNumbers(
        a.x - boxes[i],
        a.y - boxes[i + 2],
        -prepared.z0,
        b.x - boxes[i + 1],
        b.y - boxes[i + 2],
        -prepared.z1,
        boxes[i + 3],
        boxes[i + 4],
        boxes[i + 5],
      )
    )
      return true;
  return false;
}
// Synchronous gameplay checks can share scratch space; planner steps retain their own geometry.
const scratch: PreparedCollision = { z0: 0, z1: 0, boxes: [] };
export function hits(a: Flight, b: Flight, row: Row, speed: number, dt: number, margin = 0) {
  const prepared = prepareCollision(row, speed, dt, margin, scratch);
  return prepared ? hitsPrepared(a, b, prepared) : false;
}
