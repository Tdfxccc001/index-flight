import { B } from '../config/balance';
import { Random } from './SeededRandom';
import { columnHeight, type Day } from './MarketData';
import { columnX, type Column, type Row } from './Obstacles';
/** Four actual openings, with solid edge columns reaching both walls. */
export function layoutColumns(days: Day[], index: number, time: number, random: Random): Column[] {
  const amplitude =
    index < B.layoutIntroRows ? 0 : Math.min(B.layoutMaxShift, B.layoutShift + time / 1200);
  const shift = amplitude * (index % 2 === 0 ? -1 : 1);
  const gaps = B.lanes.map((x) => ({
    x: x + shift + (amplitude ? random.range(-B.layoutJitter, B.layoutJitter) : 0),
    width: random.range(B.gapWidthMin, B.gapWidthMax),
  }));
  let edge = -B.corridor / 2;
  return days.map((day, i) => {
    const right = i === 4 ? B.corridor / 2 : gaps[i].x - gaps[i].width / 2;
    const column = {
      x: (edge + right) / 2,
      width: right - edge,
      height: columnHeight(day.change),
      direction: day.direction,
      day,
    };
    if (i < 4) edge = gaps[i].x + gaps[i].width / 2;
    return column;
  });
}
export function gapCenters(row: Row, after = 0) {
  const columns = row.columns
    .map((c) => ({ ...c, x: columnX(row, c, after) }))
    .sort((a, b) => a.x - b.x);
  return columns
    .slice(0, -1)
    .map((c, i) => (c.x + c.width / 2 + columns[i + 1].x - columns[i + 1].width / 2) / 2);
}
/** Low-altitude center intervals common to a rolling set of ordinary rows. */
export function sharedLowOpenings(rows: Row[]) {
  let shared = [{ left: -B.corridor / 2 + B.wing.x, right: B.corridor / 2 - B.wing.x }];
  for (const row of rows) {
    const columns = row.columns.slice().sort((a, b) => a.x - b.x);
    const openings = columns
      .slice(0, -1)
      .map((c, i) => ({
        left: c.x + c.width / 2 + B.wing.x,
        right: columns[i + 1].x - columns[i + 1].width / 2 - B.wing.x,
      }))
      .filter((o) => o.right > o.left);
    shared = shared.flatMap((a) =>
      openings
        .map((b) => ({ left: Math.max(a.left, b.left), right: Math.min(a.right, b.right) }))
        .filter((o) => o.right > o.left),
    );
  }
  return shared;
}
/** Four touching low segments cover the four channels, including their side exits.
 * Height is set once. Their joined footprint makes climbing genuinely necessary.
 */
export function blockadeColumns(channels: readonly number[], height: number): Column[] {
  const boundaries = [
    -B.corridor / 2,
    ...channels.slice(0, -1).map((x, i) => (x + channels[i + 1]) / 2),
    B.corridor / 2,
  ];
  return channels.map((_, i) => ({
    x: (boundaries[i] + boundaries[i + 1]) / 2,
    width: boundaries[i + 1] - boundaries[i],
    height,
    direction: 'down',
  }));
}
