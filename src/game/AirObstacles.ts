import { B } from '../config/balance';
import type { Day } from './MarketData';
import type { Random } from './SeededRandom';
import type { Row } from './Obstacles';

/** Air obstacles reuse the entire upright column, including its local label frame. */
export function airObstacle(
  kind: 'beam' | 'rotor',
  id: number,
  time: number,
  random: Random,
  day: Day,
): Row {
  const width = random.range(1.3, 1.9);
  const centerY = kind === 'beam' ? random.range(2.4, 7.2) : random.range(3.7, 5.3);
  const length =
    kind === 'beam'
      ? random.range(B.corridor / 2, B.corridor - 1.5)
      : random.range(B.corridor * 0.6, B.corridor * 1.2);
  const side = random.next() < 0.5 ? -1 : 1;
  return {
    id,
    kind,
    z: -B.specialSpawnDistance,
    columns: [
      {
        x: kind === 'beam' ? (side * (B.corridor - length)) / 2 : 0,
        centerY,
        width,
        height: length,
        angle: kind === 'beam' ? Math.PI / 2 : random.range(0, Math.PI * 2),
        direction: day.direction,
        quoteDay: day,
      },
    ],
    lateral: 0,
    angularSpeed:
      kind === 'rotor' ? side * (time >= B.rotorFastUnlock ? B.rotorFastSpeed : B.rotorSpeed) : 0,
    extraSpeed:
      kind === 'beam' ? B.rushBaseSpeed + Math.min(B.rushMaxIncrease, time / B.rushRamp) : 0,
    age: 0,
    scored: false,
    top: Infinity,
    side: Infinity,
    gap: false,
  };
}

/** Reserve one row slot without consuming or replacing any historical dates. */
export function rotationSlot(rows: Row[]) {
  const market = rows
    .filter((r) => (r.kind === 'normal' || r.kind === 'moving' || r.kind === 'rotor') && r.z < -45)
    .sort((a, b) => b.z - a.z);
  if (market.length < 2) return undefined;
  const front = market[0],
    back = market[1];
  const z = front.z - B.rowSpacing;
  return {
    z,
    shiftedIds: rows
      .filter(
        (r) => r.z <= back.z && (r.kind === 'normal' || r.kind === 'moving' || r.kind === 'rotor'),
      )
      .map((r) => r.id),
  };
}
