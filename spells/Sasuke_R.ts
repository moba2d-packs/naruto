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
export const R_COOLDOWN_MS = 10_000;
/**
 * Chakra burned per second the shell stands, on top of the entry cost.
 *
 * The cooldown used to be the limiter — ninety-five seconds of it — and that
 * is not a limiter this game has anywhere else: the reference pack's 67
 * ultimates run 3–10s and not one exceeds ten. Bringing this one into that
 * band leaves 10s of downtime against an 18s form, which on the clock alone
 * would be a shell that is up more often than it is down.
 *
 * So the clock stops being the gate and the pool becomes it, exactly as
 * Kurama Mode already works. A full form costs `100 + 18 x 20 = 460` against
 * a 500 pool, and `Stats.manaRegen` is 0.1 *per frame* — 6/s — so the 352 net
 * takes about a minute to earn back. Real uptime lands near a fifth of the
 * match, and it is a number the player can watch on the bar rather than a
 * countdown they can only wait out.
 *
 * As in Kurama Mode, an empty pool does **not** end the form: `spendMana`
 * bills nothing and answers false, and the shell keeps standing. The two
 * endings stay the ones a player can see — the shell breaking, and their own
 * second press.
 */
export const R_CHAKRA_PER_SECOND = 20;
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
    // `_initialAmount` is not set here: `Shield.onCreate` amplifies `amount`
    // by ability power and then writes the field itself, so anything put in it
    // now is overwritten a frame later by a *different* number. Writing it
    // anyway is what made the line below look correct.
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
    //
    // Against `_initialAmount` — the pool core actually granted — and not
    // against `R_SHIELD`, which is only what this file asked for. Ability
    // power multiplies the shell, so a Sasuke holding one item started at
    // `747.5 / 260` = 2.87, which `clamp01` painted as a full cage until the
    // shell was already two thirds gone. The whole point of this ultimate is
    // that the other side can watch themselves breaking it.
    const full = shell._initialAmount;
    if (this.armour) this.armour.integrity = full > 0 ? shell.shieldAmount / full : 0;
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
  /**
   * **Told, not inferred.** `inferRoles` reads a `SELF` cast as
   * `Buff | Shield` and nothing else, which scored this ultimate at 4 against
   * an ordinary Q's 14 — so a bot holding either transform picked Q every
   * time Q was up and effectively never pressed R. Measured with the bot's
   * own scorer, not guessed, and it is exactly what `Spell.aiRoles` exists
   * for: core's inference is deliberately conservative and says so.
   *
   * `Shield` is *true* here — the form is a shield pool — and it is still
   * left off, because in `scoreSpell` that flag does not mean "this protects
   * me", it means "press this when I am nearly dead": +20 below half health,
   * −5 above. Tagging it made the shell's best moment the one where Sasuke is
   * already losing, which is the same panic-button shape the untagged version
   * had. Susanoo is how this champion *starts* a fight.
   *
   * `Burst` is what makes a bot spend it entering one rather than hoarding it
   * until it dies holding it.
   */
  static aiRoles = api.enums.SpellRole.Buff | api.enums.SpellRole.Burst;

  /**
   * Pressing again lowers the shell rather than finishing the ability, so the
   * bot's automatic follow-through must not spend it — see `Naruto_R`'s own
   * note for the frame-long transform that produced this.
   */
  static aiRecastAfterMs = Infinity;

  /**
   * **The shell does not scale, and it is the only ability here that doesn't.**
   *
   * `buffs/Shield` amplifies a pool by the caster's ability power, which is
   * right for every other shield in the game and wrong for this one — because
   * this shell is not a defensive stat, it is the form's *clock*. Susanoo ends
   * when the shell breaks, so amplifying it means a mage build buys uptime on
   * the very form its damage items are for: one Mũ Phù Thủy took the shell to
   * 747.5 against a 100-health champion, which nobody breaks, so the form
   * always ran to its 18-second cap and the ending the other side is supposed
   * to be able to *cause* stopped existing.
   *
   * `damageScalesWithAbilityPower` is core's own lever for "these are not
   * ability-power numbers" and it reaches the shell through the attribution
   * the form inherits from this cast — the same route `economy/ItemShop` uses
   * to keep an item's active off the stat it already pays from. It also turns
   * off the tooltip's rescale, so the text and the pool stay the same number
   * without either being told about the other.
   *
   * **Only the shell.** Yasaka Magatama, Amaterasu and Indra's Arrow are
   * `Sasuke_Q2/W2/E2`, separate spells with their own attribution, and they
   * scale exactly as they always did. Building ability power still makes
   * Susanoo hit far harder; it no longer makes Susanoo last longer.
   */
  damageScalesWithAbilityPower = false;

  name = 'Susanoo';
  image = api.asset('spell_sasuke_r');
  /**
   * `heal` and not `buff` on the shell, and the number leads its own span.
   *
   * `buffs/Shield` amplifies the pool it is given by the caster's ability
   * power, exactly as `takeDamage` amplifies a hit — so `260` is a flat number
   * the engine multiplies, which is precisely what a `damage`/`heal` span
   * claims and what a `buff` span promises it is *not*. Tagged `buff`, the
   * tooltip read 260 for the whole match while one Mũ Phù Thủy put up 747.5:
   * "ghi tạo 260 khiên, nhưng khi bấm thì khiên nhiều hơn ... tận 700 khiên".
   *
   * The number is pulled out in front of the word for the same reason. Core's
   * rescaler only moves the *leading* figure of a span, so `khiên 260` would
   * have gone on printing 260 even wearing the right class.
   *
   * It prints a flat 260 today anyway, because `damageScalesWithAbilityPower`
   * above switches the whole ability off the stat — and that is the point of
   * fixing both halves rather than either: the text and the pool now agree
   * whichever way that flag is set, instead of agreeing by accident.
   */
  description =
    `Dựng bộ giáp Susanoo: khiên <span class="heal">${R_SHIELD}</span>, to ra và chậm hơn <b>12%</b>. ` +
    "Q/W/E đổi thành <b>Yasaka Magatama</b>, <b>Amaterasu</b>, <b>Indra's Arrow</b>. " +
    `Giáp <b>vỡ là tan</b>, hoặc <b>bấm lại để hạ xuống</b>, và ngốn ` +
    `<span class="buff">${R_CHAKRA_PER_SECOND} năng lượng mỗi giây</span>. Tối đa ` +
    `<span class="time">${R_DURATION_MS / 1_000} giây</span>.`;
  manaCost = R_CHAKRA;
  coolDown = R_COOLDOWN_MS;
  targetingMode = 'SELF' as const;

  private form: SusanooForm | null = null;
  /** Carries the sub-second remainder, so the upkeep bills once per second. */
  private drainedMs = 0;

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
      this.drainedMs = 0;
      return;
    }
    const shell = form.shell;
    if (shell && (shell.toRemove || shell.shieldAmount <= 0)) {
      this.endForm();
      return;
    }

    // A second at a time, never per frame: billing `R_CHAKRA_PER_SECOND` on
    // every tick would be sixty times what the tooltip says.
    this.drainedMs += deltaTime;
    const seconds = Math.floor(this.drainedMs / 1_000);
    if (seconds <= 0) return;
    this.drainedMs -= seconds * 1_000;
    this.spendMana(seconds * R_CHAKRA_PER_SECOND);
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
    this.drainedMs = 0;
    if (form && !form.toRemove) form.deactivateBuff();
  }
}
