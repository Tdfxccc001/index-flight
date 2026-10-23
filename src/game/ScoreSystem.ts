import { B } from '../config/balance';
import type { Flight } from './FlightController';
import { columnX, type Row } from './Obstacles';
export class ScoreSystem {
  score = 0;
  combo = 1;
  maxCombo = 1;
  lastRisk = -100;
  gaps = 0;
  edges = 0;
  specials = 0;
  tops = 0;
  riskEvents = 0;
  suppressed = 0;
  private anchor = { x: 0, y: B.startY as number };
  private challenge: { kind: string; x: number; y: number } | null = null;
  update(distance: number, time: number) {
    this.score += distance * B.distanceScore;
    if (time - this.lastRisk > B.comboWindow) this.combo = 1;
  }
  observe(s: Flight, row: Row) {
    if (Math.abs(row.z) > B.thickness / 2 + B.body.z) return;
    const cols = row.columns.map((c) => ({ ...c, x: columnX(row, c) })).sort((a, b) => a.x - b.x);
    const best = !row.passage || Math.abs(row.z) < row.passage.sampleZ;
    if (best) row.passage = { ...row.passage, x: s.x, y: s.y, sampleZ: Math.abs(row.z) };
    // Upright top/gap formulas do not describe an airborne rotating surface.
    if (row.kind === 'beam' || row.kind === 'rotor') return;
    for (const c of cols) {
      for (const box of [B.body, B.wing]) {
        if (Math.abs(row.z) > B.thickness / 2 + box.z) continue;
        const dx = Math.abs(s.x - c.x) - c.width / 2 - box.x;
        const top = s.y - box.y - c.height;
        if (dx <= 0 && top >= 0 && top < row.top) {
          row.top = top;
          row.passage!.topHeight = c.height;
          row.passage!.topX = c.x;
        }
        if (s.y - box.y < c.height && s.y + box.y > 0 && dx >= 0 && dx < row.side) {
          row.side = dx;
          row.passage!.sideX = c.x + (Math.sign(s.x - c.x) * c.width) / 2;
        }
      }
    }
    for (let i = 0; i < cols.length - 1; i++) {
      const l = cols[i],
        r = cols[i + 1];
      if (
        Math.abs(row.z) <= B.thickness / 2 + B.wing.z &&
        s.x - B.wing.x > l.x + l.width / 2 &&
        s.x + B.wing.x < r.x - r.width / 2 &&
        s.y - B.body.y < Math.min(l.height, r.height)
      ) {
        row.gap = true;
        if (best) row.passage!.channel = (l.x + l.width / 2 + r.x - r.width / 2) / 2;
      }
    }
  }
  settle(row: Row, time: number, s: Flight) {
    if (row.scored) return '';
    row.scored = true;
    if (row.gap) this.gaps++;
    const p: NonNullable<Row['passage']> = row.passage || { x: s.x, y: s.y, sampleZ: 0 };
    const special =
      row.kind === 'rush' || row.kind === 'block' || row.kind === 'beam' || row.kind === 'rotor';
    const kind = special ? row.kind : row.gap ? 'gap' : row.top < B.topMargin ? 'top' : 'side';
    const target = {
      kind,
      x: p.channel ?? p.topX ?? p.sideX ?? p.x,
      y: kind === 'top' ? (p.topHeight ?? p.y) : 0,
    };
    const moved = Math.hypot(p.x - this.anchor.x, (p.y - this.anchor.y) * 0.85) >= B.riskMove;
    const novel =
      !this.challenge ||
      this.challenge.kind !== kind ||
      Math.abs(target.x - this.challenge.x) >= B.riskRouteChange ||
      (kind === 'top' && Math.abs(target.y - this.challenge.y) >= B.riskRouteChange);
    const evade =
      special &&
      !!row.threatened &&
      !!row.spawnState &&
      Math.hypot(p.x - row.spawnState.x, (p.y - row.spawnState.y) * 0.85) >= B.riskMove;
    // Geometry and actual passage displacement, never keypress counts or tiny wiggles.
    if (special ? !evade : !moved || !novel) {
      if (row.gap || row.top < B.topMargin || row.side < B.sideMargin || special) this.suppressed++;
      return '';
    }
    let reward = 0;
    const labels = [];
    if (row.gap) {
      reward += B.gapScore;
      labels.push('穿隙');
    }
    if (row.top < B.topMargin) {
      reward += B.topMinScore + (1 - row.top / B.topMargin) * (B.topScore - B.topMinScore);
      this.tops++;
      s.energy = Math.min(100, s.energy + B.topEnergy);
      labels.push('掠过柱顶');
    }
    if (row.side < B.sideMargin) {
      reward += B.sideMinScore + (1 - row.side / B.sideMargin) * (B.sideScore - B.sideMinScore);
      this.edges++;
      labels.push('机翼擦边');
    }
    if (special) {
      reward += row.kind === 'block' ? B.blockScore : B.rushScore;
      this.specials++;
      labels.push('完美闪避');
    }
    if (reward) {
      this.riskEvents++;
      this.anchor = { x: p.x, y: p.y };
      this.challenge = target;
      this.combo =
        time - this.lastRisk < B.comboWindow ? Math.min(B.comboMax, this.combo + B.comboStep) : 1;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.lastRisk = time;
      const points = Math.round(Math.min(B.rowRewardCap, reward) * this.combo);
      this.score += points;
      return labels.join(' · ') + ` +${points}`;
    }
    return '';
  }
}
