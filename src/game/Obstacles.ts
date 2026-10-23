import type { Day } from './MarketData';
import { B } from '../config/balance';
export type Kind = 'normal' | 'moving' | 'rush' | 'block';
export interface Column {
  x: number;
  width: number;
  height: number;
  direction: Day['direction'];
  day?: Day;
}
export interface Row {
  id: number;
  z: number;
  kind: Kind;
  columns: Column[];
  lateral: number;
  extraSpeed: number;
  age: number;
  scored: boolean;
  top: number;
  side: number;
  gap: boolean;
  encounter?: import('./EncounterComposer').Encounter;
  periods?: import('./MarketAnnotations').PeriodMarker[];
  spawnState?: { x: number; y: number };
  threatened?: boolean;
  passage?: {
    x: number;
    y: number;
    sampleZ: number;
    channel?: number;
    topHeight?: number;
    topX?: number;
    sideX?: number;
  };
}
const cycle = B.movingPitch * 5;
export const wrap = (x: number) => ((((x + cycle / 2) % cycle) + cycle) % cycle) - cycle / 2;
export function columnX(row: Row, c: Column, after = 0) {
  return row.kind === 'moving' ? wrap(c.x + (row.age + after) * row.lateral) : c.x;
}
export function advance(row: Row, speed: number, dt: number) {
  row.z += (speed + row.extraSpeed) * dt;
  row.age += dt;
}
export const rowPassed = (row: Row) => row.z > B.thickness / 2 + B.body.z + 0.1;
