import { B } from '../config/balance';
/** Stable small corrections, full speed at the rim; no added input smoothing. */
export function shapeTouchDrag(x: number, y: number) {
  const length = Math.hypot(x, y);
  if (length <= B.touchDeadzone) return { x: 0, y: 0 };
  const magnitude = Math.pow(
    Math.min(1, (length - B.touchDeadzone) / (1 - B.touchDeadzone)),
    B.touchCurve,
  );
  return { x: (x / length) * magnitude, y: (y / length) * magnitude };
}
