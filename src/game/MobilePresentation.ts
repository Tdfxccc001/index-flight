import { B } from '../config/balance';
export function quoteOpacity(z: number, portrait: boolean) {
  if (!portrait) return 1;
  const t = Math.max(
    0,
    Math.min(
      1,
      (-z - B.mobileNumberFullDistance) / (B.mobileNumberHideDistance - B.mobileNumberFullDistance),
    ),
  );
  return 1 - t * t * (3 - 2 * t);
}
