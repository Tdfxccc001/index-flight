import { B } from '../config/balance';
import type { Row } from './Obstacles';
/** Only dated arrays belong to the forward market stream. Incoming set pieces must
 * never postpone its refill or move its tail backwards. */
export function marketTailZ(rows: Row[]): number | undefined {
  const market = rows.filter((row) => row.kind === 'normal' || row.kind === 'moving');
  return market.length ? Math.min(...market.map((row) => row.z)) : undefined;
}
export function nextMarketRowZ(rows: Row[]) {
  const tail = marketTailZ(rows);
  return tail === undefined ? -B.firstRow : tail - B.rowSpacing;
}
export function needsMarketRow(rows: Row[]) {
  const tail = marketTailZ(rows);
  return tail === undefined || tail > -B.lookAhead + B.rowSpacing;
}
