import { B } from '../config/balance';
import { fly, clamp, type Control, type Flight } from './FlightController';
import {
  boundary,
  prepareCollision,
  hitsPrepared,
  type PreparedCollision,
} from './CollisionSystem';
import { forwardSpeed } from './DifficultyDirector';
import { columnX, type Row } from './Obstacles';
export interface PlanPoint {
  control: Control;
  duration: number;
}
export interface PlanResult {
  safe: boolean;
  path: PlanPoint[];
  visited: number;
  durationMs: number;
  end?: Flight;
}
interface Node {
  state: Flight;
  parent?: Node;
  control: Control;
  rank: number;
}
const TARGETS = B.lanes;
/** Bounded beam search. Uses the same 60Hz flight and swept collision functions as play.
 * States retain velocity, energy, fatigue, stall and recovery. A returned path is a
 * constructive witness, not a claim that arbitrary player actions remain survivable.
 */
export function findPath(
  start: Flight,
  rows: Row[],
  time: number,
  held: Control = { x: 0, y: 0 },
  beamSize: number = B.plannerBeam,
): PlanResult {
  const started = performance.now();
  let visited = 0;
  const finish = (safe: boolean, path: PlanPoint[] = [], end?: Flight): PlanResult => ({
    safe,
    path,
    visited,
    durationMs: performance.now() - started,
    end,
  });
  if (boundary(start, B.plannerMargin)) return finish(false);
  const block = B.dt * B.plannerTicks;
  const horizon = Math.min(
    B.plannerMaxHorizon,
    Math.max(1, ...rows.map((r) => (-r.z + 3) / (forwardSpeed(time) + r.extraSpeed))) + 0.5,
  );
  let beam: Node[] = [{ state: { ...start }, control: held, rank: 0 }],
    elapsed = 0,
    distance = 0;
  while (elapsed < horizon) {
    const future = rows.map((r) => ({
      ...r,
      z: r.z + distance + r.extraSpeed * elapsed,
      age: r.age + elapsed,
    }));
    const nearest = future.filter((r) => r.z < 2).sort((a, b) => b.z - a.z)[0];
    let targets: number[] = [...TARGETS];
    if (nearest) {
      const arrival = Math.max(
        0.08,
        -nearest.z / (forwardSpeed(time + elapsed) + nearest.extraSpeed),
      );
      const xs = nearest.columns
        .map((c) => ({ x: columnX(nearest, c, arrival), width: c.width }))
        .sort((a, b) => a.x - b.x);
      const gaps = xs
        .slice(0, -1)
        .map((c, i) => (c.x + c.width / 2 + xs[i + 1].x - xs[i + 1].width / 2) / 2)
        .filter((x) => Math.abs(x) < 10);
      // Aim for the moving gap at contact time, rather than static corridor lanes.
      targets = [...gaps, ...TARGETS.filter((x) => !gaps.some((g) => Math.abs(x - g) < 0.25))];
    }
    // Position and geometry depend on the logical substep, not the search branch.
    // Keep the original arithmetic order, including the original offset formula.
    const collisionSteps: PreparedCollision[][] = [];
    for (let sub = 0; sub < B.plannerTicks; sub++) {
      const offset = sub * B.dt,
        spd = forwardSpeed(time + elapsed + offset);
      const prepared: PreparedCollision[] = [];
      for (const r of future) {
        const geometry = prepareCollision(
          { ...r, z: r.z + spd * offset + r.extraSpeed * offset, age: r.age + offset },
          spd,
          B.dt,
          B.plannerMargin,
        );
        if (geometry) prepared.push(geometry);
      }
      collisionSteps.push(prepared);
    }
    const choices: Node[] = [];
    for (const node of beam) {
      const inputs: Control[] =
        elapsed < B.reactionTime
          ? [held]
          : targets.flatMap((target) =>
              [-0.8, 0, 0.8].map((y) => ({
                x: clamp((target - node.state.x) * 2.5 - node.state.vx * 0.6, -1, 1),
                y,
              })),
            );
      // Holding neutral is essential for braking and for low-energy recovery.
      if (elapsed >= B.reactionTime) inputs.push({ x: 0, y: 0 });
      for (const control of inputs) {
        let s = node.state,
          ok = true;
        for (let sub = 0; sub < B.plannerTicks; sub++) {
          const next = fly(s, control, B.dt);
          visited++;
          if (
            boundary(next, B.plannerMargin) ||
            collisionSteps[sub].some((geometry) => hitsPrepared(s, next, geometry))
          ) {
            ok = false;
            break;
          }
          s = next;
        }
        if (ok) {
          const lane = Math.min(...targets.map((x) => Math.abs(x - s.x)));
          const rank =
            Math.abs(s.y - 3.6) * 0.25 +
            lane * 0.3 +
            (100 - s.energy) * 0.008 +
            s.load * 0.16 +
            (s.stall > 0 ? 1 : 0) +
            Math.abs(s.vx) * 0.025;
          choices.push({ state: s, parent: node, control, rank });
        }
      }
    }
    if (!choices.length) return finish(false);
    choices.sort((a, b) => a.rank - b.rank);
    const buckets = new Set<string>();
    beam = [];
    // Preserve spatially different escape routes before adding velocity variants.
    // Pure best-cost pruning otherwise collapses onto one low cruising lane.
    const spatial = new Set<string>();
    for (const n of choices) {
      const key = [Math.round(n.state.x / 1.2), Math.round(n.state.y / 0.9)].join(',');
      if (spatial.has(key)) continue;
      spatial.add(key);
      beam.push(n);
      if (beam.length >= Math.floor(beamSize * 0.65)) break;
    }
    for (const n of choices) {
      const s = n.state;
      const key = [
        Math.round(s.x / 0.5),
        Math.round(s.y / 0.55),
        Math.round(s.vx / 3),
        Math.round(s.vy / 3),
        Math.round(s.load / 0.6),
        Math.round(s.energy / 20),
        Number(s.recover),
        s.stall > 0 ? 1 : 0,
      ].join(',');
      if (buckets.has(key)) continue;
      buckets.add(key);
      if (beam.includes(n)) continue;
      beam.push(n);
      if (beam.length >= beamSize) break;
    }
    for (let sub = 0; sub < B.plannerTicks; sub++)
      distance += forwardSpeed(time + elapsed + sub * B.dt) * B.dt;
    elapsed += block;
  }
  const path: PlanPoint[] = [];
  let node: Node | undefined = beam[0];
  const end = node.state;
  while (node?.parent) {
    path.push({ control: node.control, duration: block });
    node = node.parent;
  }
  path.reverse();
  return finish(true, path, end);
}
