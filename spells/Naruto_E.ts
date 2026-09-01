import { api } from '../packApi';

/**
 * Sennin Mōdo — natural energy gathered into a standing buff.
 *
 * The one ability in the base kit that changes how the *other* three feel
 * rather than adding a fourth thing to press: more attack speed, more
 * movement, and reach on the basic attack (frog kata), all at once and all
 * on a timer.
 */
export const E_DURATION_MS = 9_000;
export const E_ATTACK_SPEED = 0.45;
export const E_SPEED_PERCENT = 0.25;
export const E_RANGE_BONUS = 60;
export const E_COOLDOWN_MS = 26_000;
export const E_CHAKRA = 70;

export class SageMode extends api.buffs.Buff {
  name = 'Chế Độ Tiên';
  image = api.asset('champ_naruto');

  onActivate(): void {
    const unit = this.targetUnit;
    unit.stats.attackSpeed.baseBonus += E_ATTACK_SPEED;
    unit.stats.attackRange.baseBonus += E_RANGE_BONUS;
  }

  onDeactivate(): void {
    const unit = this.targetUnit;
    unit.stats.attackSpeed.baseBonus -= E_ATTACK_SPEED;
    unit.stats.attackRange.baseBonus -= E_RANGE_BONUS;
  }
}

export default class Naruto_E extends api.Spell {
  name = 'Sennin Mōdo';
  image = api.asset('spell_naruto_e');
  description =
    'Thu nạp năng lượng tự nhiên trong <span class="time">9 giây</span>: ' +
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
