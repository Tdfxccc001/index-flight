import type { Day } from './MarketData';
import { columnX, type Row } from './Obstacles';

/** Sample the exact row-centre crossing, including moving columns and flight drift. */
export function crossedMarketDay(
  row: Row,
  previousZ: number,
  previousX: number,
  currentX: number,
  dt: number,
): Day | undefined {
  if (previousZ >= 0 || row.z < 0 || (row.kind !== 'normal' && row.kind !== 'moving')) return;
  const fraction = -previousZ / (row.z - previousZ);
  const x = previousX + (currentX - previousX) * fraction;
  const after = -(1 - fraction) * dt;
  let nearest: Day | undefined;
  let distance = Infinity;
  for (const column of row.columns) {
    if (!column.day) continue;
    const d = Math.abs(columnX(row, column, after) - x);
    // Equal distances use the first column in the row, deterministically.
    if (d < distance) {
      distance = d;
      nearest = column.day;
    }
  }
  return nearest;
}
