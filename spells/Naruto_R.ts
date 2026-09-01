import type { Champion } from '@moba2d/core/content/types';
import { api } from '../packApi';
import Naruto_Q2 from './Naruto_Q2';
import Naruto_W2 from './Naruto_W2';
import Naruto_E2 from './Naruto_E2';

/**
 * Kurama Mode — the first transforming ultimate in the engine.
 *
 * Q, W and E become Bijuu Rasengan, Kurama Arms and Bijuudama for as long as
 * the form holds; R stays where it is, because the slot that started the form
 * is the slot that has to be able to end it.
 *
 * ## The form is a buff, and that is not a shortcut
 *
 * Everything a form has to answer to, a buff already answers. It expires on
 * its own clock. It is stripped on death, so a champion cannot respawn still
 * transformed. It shows in the buff bar with a name and an icon. Writing the
 * timer by hand on the spell would be re-implementing all three, and getting
 * the death case wrong is the kind of bug that only shows up in a real match.
 *
 * `onActivate`/`onDeactivate` rather than `onCreate`/destructor, because those
 * are the two the engine guarantees are paired — see `Buff`'s own lifecycle.
 *
 * ## Why the drain lives on the spell and not on the buff
 *
 * `Spell.spendMana` is the only sanctioned way to bill a caster, and it is
 * not fussiness: it prices the amount through `effectiveMana`, which is what
 * a no-mana ruleset (URF) acts on. A buff writing `stats.mana.value -= n`
 * would drain a pool the match rules had declared free, and the form would
 * end early in exactly the mode that promised it would not. The method is
 * `protected`, so the drain belongs here, in the spell, and the buff is left
 * owning only what it is good at — the clock, the stance and the stats.
 *
 * A form that kept running at zero chakra would make the cost decorative, so
 * running out ends it. That gives the ability a second, shorter length the
 * player can feel: spend nothing else and it lasts the full fifteen seconds,
 * spend everything and it does not.
 */
export const R_DURATION_MS = 15_000;
export const R_CHAKRA_PER_SECOND = 6;
export const R_HEALTH_BONUS = 45;
export const R_SPEED_PERCENT = 0.2;
export const R_SIZE_BONUS = 14;
export const R_COOLDOWN_MS = 90_000;
export const R_CHAKRA = 100;

/** The pack's own id for the form. Core stores it and never interprets it. */
export const KURAMA_STANCE = 'kurama';

export class KuramaMode extends api.buffs.Buff {
  name = 'Chế Độ Kurama';
  image = api.asset('champ_naruto');

  onActivate(): void {
    const naruto = this.targetUnit as Champion;
    naruto.enterStance(KURAMA_STANCE, [
      new Naruto_Q2(naruto),
      new Naruto_W2(naruto),
      new Naruto_E2(naruto),
    ]);
    naruto.stats.maxHealth.baseBonus += R_HEALTH_BONUS;
    naruto.stats.size.baseBonus += R_SIZE_BONUS;
  }

  onDeactivate(): void {
    const naruto = this.targetUnit as Champion;
    naruto.exitStance();
    naruto.stats.maxHealth.baseBonus -= R_HEALTH_BONUS;
    naruto.stats.size.baseBonus -= R_SIZE_BONUS;
    // The pool shrank under whatever is standing in it, so anyone above the
    // new ceiling is brought down to it. Without this a champion walks out of
    // the form reading 130/85.
    const ceiling = naruto.stats.maxHealth.value;
    if (naruto.stats.health.baseValue > ceiling) naruto.stats.health.baseValue = ceiling;
  }
}

export default class Naruto_R extends api.Spell {
  name = 'Kurama Mode';
  description =
    'Khoác áo chakra Cửu Vĩ trong 15 giây: <b>+45</b> máu, <b>+20%</b> tốc chạy, và ' +
    'Q/W/E đổi thành <b>Bijuu Rasengan</b>, <b>Kurama Arms</b>, <b>Bijuudama</b>. ' +
    'Tiêu hao <b>6</b> chakra mỗi giây; hết chakra là tan.';
  coolDown = R_COOLDOWN_MS;
  manaCost = R_CHAKRA;
  targetingMode = 'SELF' as const;

  /** The live form, so `onUpdate` knows whether to bill and what to end. */
  private form: KuramaMode | null = null;

  /** Carried across frames so a partial second is not rounded away each one. */
  private drainedMs = 0;

  onSpellCast(): void {
    const form = new KuramaMode(R_DURATION_MS, this.owner, this.owner);
    this.form = form;
    this.drainedMs = 0;
    this.owner.addBuff(form);
    const rush = new api.buffs.Speedup(R_DURATION_MS, this.owner, this.owner);
    rush.percent = R_SPEED_PERCENT;
    this.owner.addBuff(rush);
  }

  onUpdate(): void {
    const form = this.form;
    if (!form) return;
    // The buff ends on its own clock, on death, or on a cleanse; whichever it
    // was, the drain stops when it does and this is the one place that has to
    // notice.
    if (form.toRemove) {
      this.form = null;
      this.drainedMs = 0;
      return;
    }

    this.drainedMs += deltaTime;
    const seconds = Math.floor(this.drainedMs / 1_000);
    if (seconds <= 0) return;
    this.drainedMs -= seconds * 1_000;

    // `spendMana` bills nothing and answers false when the pool is short, so
    // the empty case cannot half-charge.
    if (!this.spendMana(seconds * R_CHAKRA_PER_SECOND)) {
      form.deactivateBuff();
      this.form = null;
      this.drainedMs = 0;
    }
  }
}
