import type { AttackableUnit, Champion } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { SharinganEye } from './Sasuke_E_Eye';
import { Sasuke_E_Sweep } from './Sasuke_E_Sweep';

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
export const E_DURATION_MS = 5_000;
export const E_REVEAL_RADIUS = 760;
export const E_ATTACK_SPEED = 0.4;
export const E_SPEED_PERCENT = 0.2;
export const E_COOLDOWN_MS = 10_000;
export const E_CHAKRA = 50;

/**
 * Sharingan's own reveal slot.
 *
 * `AttackableUnit.addBuff` groups by `stackId`, and `TrueSight` is
 * `REPLACE_EXISTING` — so every reveal left on the default id contends for one
 * slot. Core measured that with four spells sharing it: a short reveal cut a
 * long one short, and `hudState.buildBuffs` folded them into a single row
 * wearing whichever icon arrived first. `createReveal` exists to make the
 * compiler ask for the slot; this file was constructing `TrueSight` directly
 * and had quietly opted out of the question.
 */
export const REVEAL_STACK_ID = 'sasuke_e_reveal';

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
  /**
   * `Buff` alone — see `Naruto_E` for the arithmetic. A costed `SELF` cast
   * infers `Buff | Shield`, which scores 0 in a fight and 20 while fleeing,
   * so the bot pressed its own vision-and-speed steroid only when it had
   * already decided to leave.
   */
  static aiRoles = api.enums.SpellRole.Buff;

  name = 'Sharingan';
  image = api.asset('spell_sasuke_e');
  /**
   * Worded as a **scan**, because that is what it is.
   *
   * The old line — "Mở Sharingan trong 5 giây: lộ mọi tướng địch trong vùng
   * rộng" — put the duration in front and let the reveal read as something
   * that keeps happening for those five seconds. It does not: `onSpellCast`
   * runs the query **once**, at the position he cast from, and the five
   * seconds are how long whoever was caught stays lit. An enemy who walks in
   * on the second second is not revealed, and a tooltip that implies
   * otherwise is a tooltip the player will act on and be wrong.
   */
  description =
    `Quét một vòng rộng quanh mình: <span class="buff">mọi tướng địch đang đứng trong đó</span> ` +
    `bị lộ diện <span class="time">${E_DURATION_MS / 1_000} giây</span>. Trong cùng khoảng đó ` +
    `Sasuke được <span class="buff">+0.4 tốc đánh</span> và <span class="buff">+20% tốc chạy</span>.`;
  coolDown = E_COOLDOWN_MS;
  manaCost = E_CHAKRA;
  targetingMode = 'SELF' as const;

  onSpellCast(): void {
    this.owner.addBuff(new SharinganSight(E_DURATION_MS, this.owner, this.owner));

    const rush = new api.buffs.Speedup(E_DURATION_MS, this.owner, this.owner);
    rush.percent = E_SPEED_PERCENT;
    rush.image = this.image;
    this.owner.addBuff(rush);

    // The circle the player is actually buying, drawn at the point the query
    // below runs from — see `Sasuke_E_Sweep` for why it stands here rather
    // than riding his body.
    const sweep = new Sasuke_E_Sweep(this.owner);
    sweep.position.set(this.owner.position.x, this.owner.position.y);
    // Read off the same constant the query uses, never typed twice.
    sweep.reach = E_REVEAL_RADIUS;
    sweep.attachTo(this.owner);
    this.game.objectManager.addObject(sweep);

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
      target.addBuff(
        api.buffs.createReveal({
          stackId: REVEAL_STACK_ID,
          durationMs: E_DURATION_MS,
          source: this.owner,
          target,
          image: this.image,
        })
      );
    }
  }
}
