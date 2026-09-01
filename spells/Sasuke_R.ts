import type { CastSpec, Champion } from '@moba2d/core/content/types';
import { api } from '../packApi';
import Sasuke_Q2 from './Sasuke_Q2';
import Sasuke_W2 from './Sasuke_W2';
import Sasuke_E2 from './Sasuke_E2';
import { SusanooArmour } from './Sasuke_R_Armour';

/**
 * Susanoo — the pack's second transform, and deliberately not the first.
 *
 *   press          → a spectral ribcage rises around him
 *   while it holds → Q/W/E become Yasaka Magatama, Amaterasu, Indra's Arrow
 *   the shell      → soaks damage, and visibly comes apart as it does
 *   it breaks      → the form ends, wherever the clock was
 *   press again    → he puts it down early
 *
 * ## It ends on a pool, where Kurama Mode ends on a clock
 *
 * Two transforms in one pack that both ran out on a timer would be one
 * mechanic wearing two coats. The difference is the whole point of having
 * both:
 *
 *   Naruto  — a countdown. Entering means *hurry*, and the enemy's play is
 *             to survive fifteen seconds.
 *   Sasuke  — a health bar. Entering means *stand there*, and the enemy's
 *             play is to break it, which they can see themselves doing.
 *
 * So this one gives the other side something to do, and the armour is drawn
 * to make that legible from across the lane — ribs fall off it as the pool
 * drains. See `SusanooArmour`.
 *
 * The cap exists anyway, as a ceiling rather than a clock: a shell nobody
 * bothers to hit should not last the whole match.
 */
export const R_SHIELD = 260;
export const R_DURATION_MS = 18_000;
export const R_SIZE_BONUS = 22;
export const R_SLOW_PERCENT = 0.12;
export const R_COOLDOWN_MS = 95_000;
export const R_CHAKRA = 100;

export const SUSANOO_STANCE = 'susanoo';

export class SusanooForm extends api.buffs.Buff {
  name = 'Susanoo';
  image = api.asset('spell_sasuke_r');

  /** The shell. Read every frame for the armour's integrity, and for the end. */
  shell: InstanceType<typeof api.buffs.Shield> | null = null;
  private armour: SusanooArmour | null = null;

  onActivate(): void {
    const sasuke = this.targetUnit as Champion;
    sasuke.enterStance(SUSANOO_STANCE, {
      [api.enums.SpellSlot.Q]: new Sasuke_Q2(sasuke),
      [api.enums.SpellSlot.W]: new Sasuke_W2(sasuke),
      [api.enums.SpellSlot.E]: new Sasuke_E2(sasuke),
    });
    sasuke.stats.size.baseBonus += R_SIZE_BONUS;

    // A shell this size does not move quickly. The slow is the cost that
    // stops the form from being strictly better than not being in it.
    const heavy = new api.buffs.Slow(0, sasuke, sasuke);
    heavy.percent = R_SLOW_PERCENT;
    heavy.image = api.asset('spell_sasuke_r');
    heavy.sourceSpell = this.sourceSpell;
    sasuke.addBuff(heavy);
    this.heaviness = heavy;

    const shell = new api.buffs.Shield(0, sasuke, sasuke);
    shell.amount = R_SHIELD;
    shell._initialAmount = R_SHIELD;
    shell.image = api.asset('spell_sasuke_r');
    shell.color = [190, 150, 255];
    sasuke.addBuff(shell);
    this.shell = shell;

    const armour = new SusanooArmour(sasuke);
    armour.attachTo(sasuke, this);
    sasuke.game.objectManager.addObject(armour);
    this.armour = armour;
  }

  private heaviness: InstanceType<typeof api.buffs.Slow> | null = null;

  onUpdate(): void {
    const shell = this.shell;
    if (!shell) return;
    // The armour reads the pool rather than keeping a count of its own: one
    // number, and the picture cannot disagree with the health bar.
    if (this.armour) this.armour.integrity = shell.shieldAmount / R_SHIELD;
  }

  onDeactivate(): void {
    const sasuke = this.targetUnit as Champion;
    sasuke.exitStance();
    sasuke.stats.size.baseBonus -= R_SIZE_BONUS;
    // Both are ours and both outlive us by default, so both are taken down
    // here. The armour is watching this buff and drops itself.
    if (this.shell && !this.shell.toRemove) this.shell.deactivateBuff();
    if (this.heaviness && !this.heaviness.toRemove) this.heaviness.deactivateBuff();
    this.shell = null;
    this.heaviness = null;
    this.armour = null;
  }
}

export default class Sasuke_R extends api.Spell {
  name = 'Susanoo';
  image = api.asset('spell_sasuke_r');
  description =
    'Dựng bộ giáp Susanoo: <span class="buff">khiên 260</span>, to ra và chậm hơn <b>12%</b>. ' +
    "Q/W/E đổi thành <b>Yasaka Magatama</b>, <b>Amaterasu</b>, <b>Indra's Arrow</b>. " +
    'Giáp <b>vỡ là tan</b>, hoặc <b>bấm lại để hạ xuống</b>. Tối đa ' +
    '<span class="time">18 giây</span>.';
  manaCost = R_CHAKRA;
  coolDown = R_COOLDOWN_MS;
  targetingMode = 'SELF' as const;

  private form: SusanooForm | null = null;

  get castSpec(): Readonly<CastSpec> {
    return {
      activation: 'RECAST',
      targeting: 'SELF',
      castTimeMs: 0,
      active: { maxDurationMs: R_DURATION_MS, recasts: 1 },
      resource: { commitAt: 'start', refundOn: [] },
      cooldown: { startAt: 'end', durationMs: R_COOLDOWN_MS },
      // A transform is not something a stun takes off you.
      interrupts: api.enums.SpellForm.INDEPENDENT,
    };
  }

  onActivate(): void {
    const form = new SusanooForm(0, this.owner, this.owner);
    form.sourceSpell = this;
    this.form = form;
    this.owner.addBuff(form);
  }

  /**
   * The third ending, and the one that makes this champion's ultimate
   * different from the other's: the shell running out.
   *
   * Watched here rather than from inside the buff because ending the *form*
   * is this spell's job — the buff owns the shell, the spell owns the
   * activation, and only one of them should decide when the ability is over.
   */
  onUpdate(): void {
    const form = this.form;
    if (!form) return;
    if (form.toRemove) {
      this.form = null;
      return;
    }
    const shell = form.shell;
    if (shell && (shell.toRemove || shell.shieldAmount <= 0)) this.endForm();
  }

  onRecast(): void {
    this.endForm();
  }

  onComplete(): void {
    this.endForm();
  }

  onCancel(): void {
    this.endForm();
  }

  /** Idempotent: the recast path lands here twice, and cancel can follow. */
  private endForm(): void {
    const form = this.form;
    this.form = null;
    if (form && !form.toRemove) form.deactivateBuff();
  }
}
