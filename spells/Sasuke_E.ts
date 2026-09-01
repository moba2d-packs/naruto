import type { AttackableUnit, Champion } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { SharinganEye } from './Sasuke_E_Eye';

/**
 * Sharingan — he reads the fight before it happens.
 *
 * The script:
 *
 *   press        → his eye opens, red, spinning
 *   immediately  → every enemy champion in a wide circle is lit for his team
 *   for 6s       → he swings and moves faster
 *
 * The reveal is the ability. The stats are what make holding it worth a
 * button rather than a passive: an assassin who can see where everyone is
 * standing and is also faster than them is choosing a target, which is what
 * the character does.
 */
export const E_DURATION_MS = 6_000;
export const E_REVEAL_RADIUS = 760;
export const E_ATTACK_SPEED = 0.4;
export const E_SPEED_PERCENT = 0.2;
export const E_COOLDOWN_MS = 20_000;
export const E_CHAKRA = 50;

export class SharinganSight extends api.buffs.Buff {
  name = 'Sharingan';
  image = api.asset('spell_sasuke_e');

  onActivate(): void {
    const sasuke = this.targetUnit as Champion;
    sasuke.stats.attackSpeed.baseBonus += E_ATTACK_SPEED;

    const eye = new SharinganEye(sasuke);
    eye.attachTo(sasuke, this);
    sasuke.game.objectManager.addObject(eye);
  }

  onDeactivate(): void {
    this.targetUnit.stats.attackSpeed.baseBonus -= E_ATTACK_SPEED;
  }
}

export default class Sasuke_E extends api.Spell {
  name = 'Sharingan';
  image = api.asset('spell_sasuke_e');
  description =
    'Mở Sharingan trong <span class="time">6 giây</span>: <span class="buff">lộ mọi tướng địch</span> ' +
    'trong vùng rộng, <span class="buff">+0.4 tốc đánh</span> và <span class="buff">+20% tốc chạy</span>.';
  coolDown = E_COOLDOWN_MS;
  manaCost = E_CHAKRA;
  targetingMode = 'SELF' as const;

  onSpellCast(): void {
    this.owner.addBuff(new SharinganSight(E_DURATION_MS, this.owner, this.owner));

    const rush = new api.buffs.Speedup(E_DURATION_MS, this.owner, this.owner);
    rush.percent = E_SPEED_PERCENT;
    rush.image = this.image;
    this.owner.addBuff(rush);

    // Revealed one by one rather than by lighting the map: the ability is
    // "he sees *them*", and a `TrueSight` on each champion is also what makes
    // a stealthed one stop being a hole in the picture.
    const seen = this.game.objectManager.queryObjects({
      area: new api.utils.Quadtree.Circle({
        x: this.owner.position.x,
        y: this.owner.position.y,
        r: E_REVEAL_RADIUS,
      }),
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];

    for (const target of seen) {
      const lit = new api.buffs.TrueSight(E_DURATION_MS, this.owner, target);
      lit.image = this.image;
      target.addBuff(lit);
    }
  }
}
