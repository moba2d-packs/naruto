import type { AttackableUnit } from '@moba2d/core/content/types';
import { api } from '../packApi';

/**
 * Kage Bunshin no Jutsu — two shadow clones that fight beside him.
 *
 * They are `Pet`s and not spell objects, which is the whole point: a clone
 * has to pick its own targets and swing on its own timer, and `Pet` already
 * is a unit that does both. What is tuned down is durability — a clone dies
 * to a single hit of anything, which is what keeps two extra bodies from
 * being two extra health bars in every trade.
 */
export const W_CLONES = 2;
export const W_LIFETIME_MS = 8_000;
export const W_CLONE_HEALTH = 1;
export const W_CLONE_DAMAGE = 9;
export const W_SPAWN_OFFSET = 70;
export const W_COOLDOWN_MS = 16_000;
export const W_CHAKRA = 60;

export class Naruto_W_Clone extends api.units.Pet {
  constructor(summoner: AttackableUnit, spot: p5.Vector) {
    super({
      game: summoner.game,
      position: spot.copy(),
      teamId: summoner.teamId,
      ownerUnit: summoner,
      lifeTimeMs: W_LIFETIME_MS,
      followsOwner: true,
      avatar: api.asset('champ_naruto'),
      preset: {
        name: 'Phân Thân',
        attack: { damage: W_CLONE_DAMAGE, attacksPerSecond: 0.9, range: 140 },
      },
    });

    // Sized at birth, which is neither billing nor granting — the unit has not
    // existed long enough to have been hit by anything.
    this.stats.maxHealth.baseValue = W_CLONE_HEALTH;
    this.stats.health.baseValue = W_CLONE_HEALTH;
  }
}

export default class Naruto_W extends api.Spell {
  name = 'Kage Bunshin';
  image = api.asset('spell_naruto_w');
  description =
    'Tạo <span class="buff">2 phân thân</span> đánh cùng trong ' +
    '<span class="time">8 giây</span>. Mỗi phân thân gây ' +
    '<span class="damage magic">9</span> sát thương mỗi đòn và tan ngay khi trúng một đòn.';
  coolDown = W_COOLDOWN_MS;
  manaCost = W_CHAKRA;
  targetingMode = 'SELF' as const;

  onSpellCast(): void {
    for (let index = 0; index < W_CLONES; index++) {
      // Fanned to either side rather than stacked on him: two bodies on the
      // same pixel look like one and block each other out of the fight.
      const angle = (index / W_CLONES) * Math.PI * 2 + Math.PI / 4;
      const spot = this.owner.position
        .copy()
        .add(Math.cos(angle) * W_SPAWN_OFFSET, Math.sin(angle) * W_SPAWN_OFFSET);
      this.game.objectManager.addObject(new Naruto_W_Clone(this.owner, spot));
    }
  }
}
