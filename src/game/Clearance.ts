import { B } from '../config/balance';
import type { Flight } from './FlightController';
import { forwardSpeed } from './DifficultyDirector';
import { columnX, type Row } from './Obstacles';
export interface Interval {
  left: number;
  right: number;
}
export interface Clearance {
  rowId: number;
  z: number;
  arrival: number;
  safe: boolean;
  left: number;
  right: number;
  steer: number;
  top: number;
  moving: boolean;
  openings: Interval[];
}
export function arrivalTime(row: Row, time: number) {
  let lo = 0,
    hi = 20;
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    const d =
      B.maxSpeed * t -
      (B.maxSpeed - B.speed) *
        B.speedRamp *
        (Math.exp(-time / B.speedRamp) - Math.exp(-(time + t) / B.speedRamp)) +
      row.extraSpeed * t;
    if (d < -row.z) lo = t;
    else hi = t;
  }
  return (lo + hi) / 2;
}
/** Center-space openings: Minkowski expansion by BOTH actual collision boxes.
 * Assumes current x/y are held; does not predict or warn about special rushes.
 */
export function clearanceAt(s: Flight, row: Row, time: number): Clearance {
  const arrival = arrivalTime(row, time),
    speed = forwardSpeed(time + arrival) + row.extraSpeed;
  const duration = (B.thickness / 2 + B.body.z) / speed;
  const blocked: Interval[] = [];
  const start = Math.max(0, arrival - duration),
    end = arrival + duration;
  const motionPad = row.kind === 'moving' ? (Math.abs(row.lateral) * (end - start)) / 16 : 0;
  let top = Infinity;
  for (let sample = 0; sample <= 8; sample++) {
    const t = start + ((end - start) * sample) / 8;
    for (const c of row.columns) {
      const x = columnX(row, c, t);
      for (const box of [B.body, B.wing]) {
        if (Math.abs(s.x - x) <= c.width / 2 + box.x && s.y - box.y >= c.height)
          top = Math.min(top, s.y - box.y - c.height);
        if (s.y - box.y <= c.height && s.y + box.y >= 0)
          blocked.push({
            left: x - c.width / 2 - box.x - motionPad,
            right: x + c.width / 2 + box.x + motionPad,
          });
      }
    }
  }
  blocked.sort((a, b) => a.left - b.left);
  const merged: Interval[] = [];
  for (const interval of blocked) {
    const last = merged.at(-1);
    if (last && interval.left <= last.right) last.right = Math.max(last.right, interval.right);
    else merged.push({ ...interval });
  }
  const min = -B.corridor / 2 + B.wing.x,
    max = B.corridor / 2 - B.wing.x;
  const openings: Interval[] = [];
  let left = min;
  for (const range of merged) {
    if (range.right < min || range.left > max) continue;
    const right = Math.min(max, range.left);
    if (right > left) openings.push({ left, right });
    left = Math.max(left, range.right);
  }
  if (left < max) openings.push({ left, right: max });
  const current = openings.find((o) => s.x > o.left && s.x < o.right);
  const nearest =
    current ||
    openings.reduce<Interval | undefined>(
      (best, o) =>
        !best ||
        Math.abs((o.left + o.right) / 2 - s.x) < Math.abs((best.left + best.right) / 2 - s.x)
          ? o
          : best,
      undefined,
    );
  return {
    rowId: row.id,
    z: row.z,
    arrival,
    safe: !!current && s.y > B.body.y,
    left: current ? s.x - current.left : 0,
    right: current ? current.right - s.x : 0,
    steer: current ? 0 : nearest ? Math.sign((nearest.left + nearest.right) / 2 - s.x) : 0,
    top,
    moving: row.kind === 'moving',
    openings,
  };
}
