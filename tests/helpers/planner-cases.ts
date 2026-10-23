import fs from 'node:fs';
import { B } from '../../src/config/balance';
import { initialFlight } from '../../src/game/FlightController';
import type { Day } from '../../src/game/MarketData';
import type { Row } from '../../src/game/Obstacles';
import { layoutColumns, blockadeColumns } from '../../src/game/RowLayout';
import { Random } from '../../src/game/SeededRandom';

export function plannerCases() {
  const days: Day[] = JSON.parse(
    fs.readFileSync('public/data/sse_composite_daily.json', 'utf8'),
  ).records;
  return Array.from({ length: 20 }, (_, index) => {
    const seed = index + 1,
      rng = new Random(seed * 527),
      time = seed * 11;
    const kind = (['normal', 'moving', 'rush', 'block'] as const)[index % 4];
    const offset = rng.int(days.length - 30);
    const rows: Row[] = Array.from({ length: 6 }, (_, i) => ({
      id: i,
      z: -B.firstRow - i * B.rowSpacing,
      kind: i === 2 && kind === 'moving' ? 'moving' : 'normal',
      columns: layoutColumns(
        days.slice(offset + i * 5, offset + i * 5 + 5),
        seed * 6 + i,
        time,
        rng,
      ).map((c, j) =>
        i === 2 && kind === 'moving'
          ? { ...c, x: (j - 2) * B.movingPitch, width: B.movingWidth }
          : c,
      ),
      lateral: i === 2 && kind === 'moving' ? (seed % 2 ? -1 : 1) * 1.2 : 0,
      extraSpeed: 0,
      age: rng.range(0, 10),
      scored: false,
      top: Infinity,
      side: Infinity,
      gap: false,
    }));
    const flight = {
      ...initialFlight(),
      x: seed % 2 ? 2.375 : -2.375,
      y: seed % 3 ? 3 : 4.3,
      energy: seed % 5 ? 70 : 5,
      load: seed % 7 ? 0 : 2.1,
      stall: seed === 19 ? 0.4 : 0,
      recover: seed === 19,
    };
    if (kind === 'rush' || kind === 'block')
      rows.push({
        id: 99,
        z: -85,
        kind,
        columns:
          kind === 'block'
            ? blockadeColumns(B.lanes, flight.y + B.blockHeadroom)
            : [{ x: flight.x, width: B.rushWidth, height: 7, direction: 'down' }],
        lateral: 0,
        extraSpeed: 12,
        age: 0,
        scored: false,
        top: Infinity,
        side: Infinity,
        gap: false,
      });
    if (seed === 20)
      rows.push({
        ...rows[0],
        id: 100,
        z: -8,
        columns: [{ x: 0, width: 30, height: 30, direction: 'down' }],
      });
    return { seed, kind, time, rows, flight, held: { x: 0, y: 0 } };
  });
}
