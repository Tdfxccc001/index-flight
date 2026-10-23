import { B } from '../config/balance';
export interface Flight {
  x: number;
  y: number;
  vx: number;
  vy: number;
  energy: number;
  load: number;
  stall: number;
  recover: boolean;
}
export interface Control {
  x: number;
  y: number;
}
export const initialFlight = (): Flight => ({
  x: 0,
  y: B.startY,
  vx: 0,
  vy: 0,
  energy: 100,
  load: 0,
  stall: 0,
  recover: false,
});
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export function fly(s: Flight, input: Control, dt: number): Flight {
  const n = { ...s };
  let { x, y } = input;
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  n.stall = Math.max(0, n.stall - dt);
  if (s.stall > 0) {
    n.recover = true;
    n.load = Math.max(0, n.load - dt * 0.5);
  } else if (y > 0.3 && !n.recover) {
    n.load += dt * y;
    if (n.load >= B.stallLoad) {
      n.stall = B.stallDuration;
      n.recover = true;
    }
  } else n.load = Math.max(0, n.load - dt * B.loadRecovery);
  if (y <= 0.1 && n.stall === 0 && n.load < 0.4) n.recover = false;
  const high = clamp((n.y - B.highZone) / (B.ceiling - B.highZone), 0, 1);
  const low = clamp((B.lowZone - n.y) / 2, 0, 1);
  n.energy = clamp(n.energy + (low * B.regen - high * B.drain) * dt, 0, 100);
  const soft = clamp((B.ceiling - n.y) / (B.ceiling - B.softStart), 0, 1);
  let targetY =
    y > 0 ? y * B.upSpeed * soft * (n.energy <= 0 || n.recover ? 0 : 1) : y * B.downSpeed;
  if (n.stall > 0) targetY = -B.stallSink;
  else if (n.energy <= 0) targetY = Math.min(targetY, -B.exhaustedSink);
  const a = 1 - Math.exp(-B.response * dt);
  n.vx += (x * B.xSpeed - n.vx) * a;
  n.vy += (targetY - n.vy) * a;
  // Asymptotic height limit: no collision, bounce or hidden hard ceiling.
  if (n.vy > 0) n.vy = Math.min(n.vy, Math.max(0, (B.ceiling - n.y) * 3));
  n.x += n.vx * dt;
  n.y += n.vy * dt;
  return n;
}
