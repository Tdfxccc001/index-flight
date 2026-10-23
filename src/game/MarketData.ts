import { B } from '../config/balance';
import { Random } from './SeededRandom';
export interface Day {
  date: string;
  close: number;
  change: number;
  direction: 'up' | 'down' | 'flat';
}
export interface Market {
  real: boolean;
  symbol: string;
  records: Day[];
  toDate: string;
  baseline: { date: string; close: number };
}
export function validateMarket(m: Market) {
  if (!m.real || m.symbol !== '000001.SH' || m.records.length < 900)
    throw Error('正式上证指数数据缺失');
  let prev = m.baseline.close,
    date = m.baseline.date;
  for (const d of m.records) {
    if (
      d.date <= date ||
      !Number.isFinite(d.close) ||
      Math.abs(d.close - prev - d.change) > 0.011 ||
      d.direction !== (d.change > 0 ? 'up' : d.change < 0 ? 'down' : 'flat')
    )
      throw Error('行情数据校验失败');
    prev = d.close;
    date = d.date;
  }
}
export const columnHeight = (delta: number) =>
  B.heightMin +
  ((B.heightMax - B.heightMin) * Math.log1p(Math.min(Math.abs(delta), B.deltaCap) / B.deltaScale)) /
    Math.log1p(B.deltaCap / B.deltaScale);
export class MarketSequence {
  index = 0;
  constructor(
    public days: Day[],
    private random: Random,
  ) {}
  next(): Day[] {
    if (this.index >= this.days.length) {
      const start = this.random.int(this.days.length - 4);
      return this.days.slice(start, start + 5);
    }
    const row = this.days.slice(this.index, this.index + 5);
    this.index += row.length;
    if (row.length < 5) {
      const start = this.random.int(this.days.length - 4);
      row.push(...this.days.slice(start, start + 5 - row.length));
    }
    return row;
  }
}
