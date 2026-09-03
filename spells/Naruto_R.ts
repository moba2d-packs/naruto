import type { CastSpec, Champion } from '@moba2d/core/content/types';
import { api } from '../packApi';
import Naruto_Q2 from './Naruto_Q2';
import Naruto_W2 from './Naruto_W2';
import Naruto_E2 from './Naruto_E2';
import { KuramaAura } from './Naruto_R_Aura';

const heal = api.text.heal;

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
 * ## The enemy has to be able to see it
 *
 * A transformed champion that looks untransformed is a fifteen-second window
 * nobody else can read: no reason to back off, no way to know when it ends,
 * and the ultimate lands on them as damage with no cause on screen. So the
 * form says so twice, in the two places a player actually looks — the avatar
 * (portrait, scoreboard, death recap) and the body itself (`KuramaAura`).
 *
 * The avatar is a plain field, so swapping it is the whole mechanism; it is
 * put back on deactivate rather than reassigned from the champion's roster
 * entry, because a champion may have arrived here through a hand-built kit
 * and never had a roster entry to read back.
 *
 * ## The upkeep has to be able to actually end it
 *
 * The first cut charged 6 a second. A champion's pool is 500 —
 * `Stats.ts`'s own default, and `ChampionDefenceTuning` carries no mana
 * field, so no pack can lower it — which makes fifteen seconds of that
 * ninety, on top of a hundred to cast. The pool cannot run out, so the form
 * *always* ended on the timer and the tooltip's "run dry and it ends" was a
 * promise nothing could keep. Reported from a real match as the form cutting
 * out "khi mana vẫn còn nhiều": the clause was noise, so the ending looked
 * arbitrary.
 *
 * At 22 a second the two endings are both reachable and the ability becomes a
 * real decision. Do nothing and 15s of upkeep is 330 of the 400 left after
 * casting — the timer wins with room to spare. Actually *use* the form (45 +
 * 40 + 90) and the pool gives out first. "Casting inside the form shortens
 * it" is now something the numbers do rather than something the text claims.
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
export const R_CHAKRA_PER_SECOND = 22;
export const R_HEALTH_BONUS = 45;
/**
 * Health handed over on the way in, on top of the raised ceiling.
 *
 * The ceiling alone was the first cut and it read as broken: the bar got
 * *longer* while the filled part stayed where it was, so transforming looked
 * like it had taken health away. Reported as "chỉ thấy đang tăng máu tối đa +
 * to hơn, mà máu vẫn thấp thì kỳ". A form that makes you bigger has to make
 * you feel bigger on the frame it starts.
 */
export const R_HEAL_ON_ENTER = 45;
export const R_SPEED_PERCENT = 0.2;
export const R_SIZE_BONUS = 14;
export const R_COOLDOWN_MS = 10_000;
export const R_CHAKRA = 100;

/** The pack's own id for the form. Core stores it and never interprets it. */
export const KURAMA_STANCE = 'kurama';

export class KuramaMode extends api.buffs.Buff {
  name = 'Chế Độ Kurama';
  image = api.asset('spell_naruto_r');

  /** Whatever face he wore before the form, so it can be given back exactly. */
  private woreBefore: Champion['avatar'] | null = null;

  onActivate(): void {
    const naruto = this.targetUnit as Champion;
    // Keyed by slot, never positional: `Champion.spells` is
    // `[attack, Q, W, E, R]`, so filling "the first three" replaces the basic
    // attack and shifts the kit one place left. That shipped once.
    naruto.enterStance(KURAMA_STANCE, {
      [api.enums.SpellSlot.Q]: new Naruto_Q2(naruto),
      [api.enums.SpellSlot.W]: new Naruto_W2(naruto),
      [api.enums.SpellSlot.E]: new Naruto_E2(naruto),
    });
    naruto.stats.maxHealth.baseBonus += R_HEALTH_BONUS;
    naruto.stats.size.baseBonus += R_SIZE_BONUS;

    // Fill the new room, capped at the new ceiling. Through `takeHeal` rather
    // than by writing the pool, so shielding, heal-cut and the floating green
    // number all behave the way they do for every other heal in the game.
    naruto.takeHeal?.(R_HEAL_ON_ENTER, naruto);

    this.woreBefore = naruto.avatar;
    naruto.avatar = api.asset('champ_naruto_kurama');

    // The cloak is its own object rather than something the buff paints:
    // `Champion.draw()` is skipped for a culled or fogged caster, and the
    // viewer who most needs to see the form is the one across the wall.
    const cloak = new KuramaAura(naruto);
    cloak.attachTo(naruto, this);
    naruto.game.objectManager.addObject(cloak);
  }

  onDeactivate(): void {
    const naruto = this.targetUnit as Champion;
    naruto.exitStance();
    naruto.stats.maxHealth.baseBonus -= R_HEALTH_BONUS;
    naruto.stats.size.baseBonus -= R_SIZE_BONUS;
    // The cloak is watching this buff, so it drops itself — nothing to undo
    // here but the face.
    if (this.woreBefore !== null) naruto.avatar = this.woreBefore;
    // The pool shrank under whatever is standing in it, so anyone above the
    // new ceiling is brought down to it. Without this a champion walks out of
    // the form reading 130/85.
    const ceiling = naruto.stats.maxHealth.value;
    if (naruto.stats.health.baseValue > ceiling) naruto.stats.health.baseValue = ceiling;
  }
}

export default class Naruto_R extends api.Spell {
  /**
   * **Told, not inferred.** `inferRoles` reads a `SELF` cast as
   * `Buff | Shield` and nothing else, which scored this ultimate at 4 against
   * an ordinary Q's 14 — so a bot holding either transform picked Q every
   * time Q was up and effectively never pressed R. Measured with the bot's
   * own scorer, not guessed, and it is exactly what `Spell.aiRoles` exists
   * for: core's inference is deliberately conservative and says so.
   *
   * `Burst` is the honest tag: entering a form is a commitment to fight
   * *now*, which is what the burst term is scoring.
   */
  static aiRoles = api.enums.SpellRole.Buff | api.enums.SpellRole.Burst;

  /**
   * The second half of "the bot never uses R", and the half tagging the roles
   * did not touch.
   *
   * `BotBrain.cast` schedules a follow-through press for every `RECAST`
   * activation, because for every other recast ability in the game that is
   * what a recast is: the payload. Here it is the opposite — pressing again
   * is how the player puts the form *down* — and `recastDelayMs` defaults to
   * 0, so the bot entered Kurama Mode and toggled it off on the next think
   * tick. It paid 100 chakra for one frame of form, every time, and from
   * outside nothing happened at all.
   *
   * Reported twice: once before the roles were tagged and once after, which
   * is what finally separated the two causes. Scoring the ability higher
   * cannot fix an ability that ends the instant it starts.
   */
  static aiRecastAfterMs = Infinity;

  name = 'Kurama Mode';
  image = api.asset('spell_naruto_r');
  // "Năng lượng", not "chakra": there is no chakra bar on screen. The blue
  // bar is the only resource a player can see, and naming the mechanic after
  // something the UI never shows is how a tooltip stops being checkable.
  description =
    `Khoác áo chakra Cửu Vĩ trong <span class="time">${R_DURATION_MS / 1_000} giây</span>: ` +
    '<span class="buff">+45 máu tối đa</span>, <span class="buff">+20% tốc chạy</span>, ' +
    'và Q/W/E đổi thành <b>Bijuu Rasengan</b>, <b>Kurama Arms</b>, <b>Bijuudama</b>. ' +
    `Hồi ngay ${heal(45)} máu khi bật, và ngốn ` +
    `<span class="buff">${R_CHAKRA_PER_SECOND} năng lượng mỗi giây</span>. ` +
    '<b>Bấm lại để tắt sớm</b> — hồi chiêu chỉ bắt đầu tính khi form kết thúc.';
  coolDown = R_COOLDOWN_MS;
  manaCost = R_CHAKRA;
  get castSpec(): Readonly<CastSpec> {
    return {
      // The runtime's own recast window is what makes a second press reach
      // this spell at all: with a plain press the ability is on its 90s
      // cooldown a frame after it starts, and the toggle-off press is simply
      // refused.
      activation: 'RECAST',
      targeting: 'SELF',
      castTimeMs: 0,
      active: { maxDurationMs: R_DURATION_MS, recasts: 1 },
      resource: { commitAt: 'start', refundOn: [] },
      // At `end`, so the ninety seconds start when the form does — not when
      // it began. Leaving early therefore genuinely costs less time as well
      // as less mana.
      cooldown: { startAt: 'end', durationMs: R_COOLDOWN_MS },
      // A transform is not something a stun should take off you. Only death
      // reaches an INDEPENDENT activation, which is the honest description of
      // a chakra cloak already wrapped around him.
      interrupts: api.enums.SpellForm.INDEPENDENT,
    };
  }

  /** The live form, so `onUpdate` knows whether to bill and what to end. */
  private form: KuramaMode | null = null;

  /** Carried across frames so a partial second is not rounded away each one. */
  private drainedMs = 0;

  /**
   * The runtime owns the clock, so the buff is permanent (`duration: 0`) and
   * ends only when this spell says so — on the recast, on the cap, or on
   * death. Two clocks for one form is two clocks that can disagree.
   */
  onActivate(): void {
    const form = new KuramaMode(0, this.owner, this.owner);
    this.form = form;
    this.drainedMs = 0;
    this.owner.addBuff(form);
    const rush = new api.buffs.Speedup(R_DURATION_MS, this.owner, this.owner);
    rush.percent = R_SPEED_PERCENT;
    this.owner.addBuff(rush);
  }

  /** The second press. `completeActivation` follows it, so `onComplete` tidies. */
  onRecast(): void {
    this.endForm();
  }

  onComplete(): void {
    this.endForm();
  }

  /** Death, and anything else that reaches an INDEPENDENT activation. */
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

  /**
   * The upkeep, and **it never ends the form**.
   *
   * There are exactly two ways out — the fifteen-second cap, and the player's
   * own second press — and that is the whole point. A third ending that fired
   * on an empty pool is what produced the original report ("R bị ngắt khi mana
   * vẫn còn nhiều"): an ability that stops for a reason the player cannot see
   * reads as broken even when the arithmetic is right.
   *
   * The upkeep is still a real cost, because it is eating the pool the form's
   * own abilities are spending from. Running dry means Bijuudama is out of
   * reach, which the player *can* see, on the bar, before it happens.
   */
  onUpdate(): void {
    const form = this.form;
    if (!form) return;
    if (form.toRemove) {
      this.form = null;
      this.drainedMs = 0;
      return;
    }

    this.drainedMs += deltaTime;
    const seconds = Math.floor(this.drainedMs / 1_000);
    if (seconds <= 0) return;
    this.drainedMs -= seconds * 1_000;

    // Whatever is affordable, and nothing when it is not. `spendMana` bills
    // nothing and answers false on a short pool, so this cannot half-charge.
    this.spendMana(seconds * R_CHAKRA_PER_SECOND);
  }
}
