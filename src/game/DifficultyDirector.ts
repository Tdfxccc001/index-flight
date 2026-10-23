import { specialCapacity } from './EncounterComposer';
import { B } from '../config/balance';
import { Random } from './SeededRandom';
import type { Kind } from './Obstacles';
export const forwardSpeed = (time: number) =>
  B.speed + (B.maxSpeed - B.speed) * (1 - Math.exp(-time / B.speedRamp));
export class DifficultyDirector {
  lastSpecial = -100;
  encounters = 0;
  constructor(private random: Random) {}
  choose(time: number, active: number, normal = true): Kind {
    if (
      time < B.movingUnlock ||
      time - this.lastSpecial <
        (time >= B.encounterUnlock ? B.encounterCooldown : B.specialCooldown) ||
      active >= specialCapacity(time)
    )
      return 'normal';
    if (this.random.next() > B.specialChance) return 'normal';
    this.lastSpecial = time;
    if (normal) return 'moving';
    if (time >= B.encounterUnlock)
      return this.encounters % 4 === 1 || this.encounters % 4 === 3 ? 'block' : 'rush';
    if (time >= B.blockUnlock && this.random.next() < B.blockChance) return 'block';
    return time >= B.rushUnlock ? 'rush' : 'normal';
  }
}
