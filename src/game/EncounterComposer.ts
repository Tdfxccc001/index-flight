import { B } from '../config/balance';
import { hits } from './CollisionSystem';
import type { Flight } from './FlightController';
import type { Row } from './Obstacles';
export type Encounter =
  | 'single'
  | 'slalom'
  | 'crossfire'
  | 'stepped'
  | 'climb-turn'
  | 'counterflow';
export const specialCapacity = (time: number) =>
  time >= B.tripleSpecialUnlock ? 3 : time > B.doubleSpecialUnlock ? 2 : 1;
/** Frozen, spatially separated scores: no chasing columns or scripted unavoidable hits.
 * Callers must validate the WHOLE batch alongside existing obstacles before committing. */
export function composeEncounter(
  primary: Row,
  flight: Flight,
  channels: readonly number[],
  time: number,
  ordinal: number,
  active: number,
  nextId: () => number,
): Row[] {
  primary.encounter = 'single';
  if (primary.kind === 'normal' || time < B.encounterUnlock) return [primary];
  if (primary.kind === 'moving') {
    primary.encounter = 'counterflow';
    return [primary];
  }
  const variant = Math.floor(ordinal / 2) % 2;
  const room = specialCapacity(time) - active;
  if (primary.kind === 'block' && (variant === 0 || time < B.advancedEncounterUnlock || room < 2)) {
    primary.encounter = 'stepped';
    // Every segment still starts above the aircraft, and heights never change later.
    const steps = variant === 0 ? [0, 2, 1, 3] : [3, 1, 2, 0];
    primary.columns.forEach((c, i) => (c.height += steps[i] * B.steppedHeight));
    return [primary];
  }
  if (room < 2) return [primary];
  const nearest = channels.reduce(
    (a, x, i) => (Math.abs(x - flight.x) < Math.abs(channels[a] - flight.x) ? i : a),
    0,
  );
  const target = (nearest + (ordinal % 2 ? 1 : -1) + channels.length) % channels.length;
  const pattern: Encounter =
    primary.kind === 'block'
      ? 'climb-turn'
      : time >= B.advancedEncounterUnlock && variant
        ? 'crossfire'
        : 'slalom';
  primary.encounter = pattern;
  const companion: Row = {
    ...primary,
    id: nextId(),
    kind: 'rush',
    encounter: pattern,
    z: primary.z - B.encounterSeparation,
    extraSpeed: pattern === 'crossfire' ? primary.extraSpeed + 3 : primary.extraSpeed,
    columns: [
      {
        x: channels[target],
        width: B.rushWidth,
        height: Math.min(B.rushMaxHeight, flight.y + B.rushHeightExtra),
        direction: 'down',
      },
    ],
    age: 0,
    scored: false,
    top: Infinity,
    side: Infinity,
    gap: false,
    passage: undefined,
    spawnState: { x: flight.x, y: flight.y },
    threatened: false,
  };
  companion.threatened = hits(flight, flight, { ...companion, z: 0 }, 0, 0);
  return [primary, companion];
}
