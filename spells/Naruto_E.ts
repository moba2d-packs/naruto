import type { Champion } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { SageAura } from './Naruto_E_Aura';

/**
 * Sennin Mōdo — natural energy gathered into a standing buff.
 *
 * The one ability in the base kit that changes how the *other* three feel
 * rather than adding a fourth thing to press: more attack speed, more
 * movement, and reach on the basic attack (frog kata), all at once and all
 * on a timer.
 */
export const E_DURATION_MS = 5_000;
export const E_ATTACK_SPEED = 0.45;
export const E_SPEED_PERCENT = 0.25;
export const E_RANGE_BONUS = 60;
export const E_COOLDOWN_MS = 10_000;
export const E_CHAKRA = 70;

export class SageMode extends api.buffs.Buff {
  name = 'Chế Độ Tiên';
  image = api.asset('spell_naruto_e');

  onActivate(): void {
    const unit = this.targetUnit as Champion;
    unit.stats.attackSpeed.baseBonus += E_ATTACK_SPEED;
    unit.stats.attackRange.baseBonus += E_RANGE_BONUS;

    // Its own object, not something the buff paints: `Champion.draw()` is
    // skipped for a culled or fogged caster, and the player who most needs to
    // see the marks is the one deciding whether to walk into him.
    const marks = new SageAura(unit);
    marks.attachTo(unit, this);
    unit.game.objectManager.addObject(marks);
  }

  onDeactivate(): void {
    const unit = this.targetUnit;
    unit.stats.attackSpeed.baseBonus -= E_ATTACK_SPEED;
    unit.stats.attackRange.baseBonus -= E_RANGE_BONUS;
  }
}

export default class Naruto_E extends api.Spell {
  /**
   * Told, because the inference for a costed `SELF` cast is `Buff | Shield`
   * and the `Shield` half is a lie with consequences.
   *
   * `scoreSpell` pays `Shield` **+20 below half health and −5 above it**, so
   * `Buff + Shield` comes to exactly 0 in every fighting situation — and
   * `chooseSpell` drops any candidate scoring `<= 0`. Sage Mode was therefore
   * unreachable in a fight and only ever pressed as a panic button by a bot
   * already running away, which is the one moment its attack speed and reach
   * are worth least. Sixty-five other abilities across the three packs share
   * the shape; this is the fix for this one.
   *
   * `Buff` alone, and nothing else: the ability heals nothing, shields
   * nothing and damages nothing. It scores 5 everywhere, which is what core
   * pays a steroid, and 5 is a number a bot can act on.
   */
  static aiRoles = api.enums.SpellRole.Buff;

  name = 'Sennin Mōdo';
  image = api.asset('spell_naruto_e');
  description =
    `Thu nạp năng lượng tự nhiên trong <span class="time">${E_DURATION_MS / 1_000} giây</span>: ` +
    '<span class="buff">+0.45 tốc đánh</span>, <span class="buff">+60 tầm đánh</span> ' +
    'và <span class="buff">+25% tốc chạy</span>.';
  coolDown = E_COOLDOWN_MS;
  manaCost = E_CHAKRA;
  targetingMode = 'SELF' as const;

  onSpellCast(): void {
    this.owner.addBuff(new SageMode(E_DURATION_MS, this.owner, this.owner));
    const rush = new api.buffs.Speedup(E_DURATION_MS, this.owner, this.owner);
    rush.percent = E_SPEED_PERCENT;
    this.owner.addBuff(rush);
  }
}
