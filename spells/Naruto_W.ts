import type {
  AttackableUnit,
  CastSpec,
  Champion,
  DamageType,
} from '@moba2d/core/content/types';
import { api } from '../packApi';
import { Naruto_W_Smoke } from './Naruto_W_Smoke';

/**
 * Kage Bunshin no Jutsu — vanish into smoke, come out as three of him.
 *
 * ## What was wrong with the first cut
 *
 * Two clones with **one** health point that stood beside him wearing a
 * summon's narrow bar. They died to a stray minion swing before doing
 * anything, and no enemy ever had to guess which body was real, because core
 * draws a pet as *visibly subordinate* on purpose — a 52px bar with no buff
 * row. Reported as both: weaker than Shaco's or Zed's, and instantly
 * identifiable.
 *
 * ## What makes a decoy work
 *
 * Three things, and it needs all three:
 *
 * 1. **A moment nobody can see.** The smoke covers the swap. Without it the
 *    enemy's eye simply follows the body that never moved.
 * 2. **The same silhouette.** Same portrait, same body size, and — the part
 *    that gave it away — the same *health bar*: full width, buff icons, and
 *    the same numbers he has. `Pet` deliberately opts out of all of that, so
 *    this class opts back in. That is a real disagreement with core's default
 *    and it is the right one here: "visibly subordinate" is correct for a
 *    healing totem and is the exact opposite of what a shadow clone is for.
 * 3. **Enough life to be worth attacking.** A decoy that dies to one hit is
 *    not a decision, it is a delay. These carry his numbers and take triple
 *    damage, so they die in a few hits rather than one — the enemy finds out
 *    by committing, which is the cost the ability is selling.
 */
export const W_CLONES = 2;
export const W_LIFETIME_MS = 9_000;
export const W_CLONE_DAMAGE_TAKEN = 3;
export const W_CLONE_ATTACK_SHARE = 0.55;
export const W_SPAWN_OFFSET = 96;
export const W_VANISH_MS = 550;
export const W_COOLDOWN_MS = 18_000;
export const W_CHAKRA = 60;

export class Naruto_W_Clone extends api.units.Pet {
  /**
   * Core makes a summon look subordinate — 52px of bar and no buff row (see
   * `Pet`'s own note). Every one of those is a tell, and a clone whose job is
   * to be mistaken for a champion has to wear the champion's frame instead.
   */
  protected override compactBarWidth = 88;
  protected override compactShowsBuffIcons = true;

  constructor(summoner: Champion, spot: p5.Vector) {
    super({
      game: summoner.game,
      position: spot.copy(),
      teamId: summoner.teamId,
      ownerUnit: summoner,
      lifeTimeMs: W_LIFETIME_MS,
      // It scatters rather than heeling: a body glued to his shoulder is a
      // body the enemy can rule out by watching which two move together.
      followsOwner: false,
      avatar: api.asset('champ_naruto'),
      preset: {
        // His name over its head too — a clone labelled "Phân Thân" is a
        // clone the enemy never has to think about.
        name: summoner.name,
        // Read off the live stats, not off a preset: `Champion.attack` is a
        // construction option and not a field on the built unit, and the
        // numbers that matter are the ones he is actually swinging with —
        // items included.
        attack: {
          damage: summoner.stats.attackDamage.value * W_CLONE_ATTACK_SHARE,
          attacksPerSecond: summoner.stats.attackSpeed.value,
          range: summoner.stats.attackRange.value,
        },
      },
    });

    // His numbers, so the bar over its head reads exactly like the bar over
    // his. Sizing a summon's pool at birth is neither billing nor granting —
    // the unit has not existed long enough to have been hit by anything.
    this.stats.maxHealth.baseValue = summoner.stats.maxHealth.value;
    this.stats.health.baseValue = summoner.stats.health.value;
    this.stats.size.baseValue = summoner.stats.size.value;
  }

  /**
   * Core's `Pet` forces the compact frame regardless of what it is handed.
   * This takes the argument back, which — with the two fields above — is what
   * makes the frame identical to a champion's rather than merely wider.
   */
  drawHealthBar(compact = false): void {
    api.units.Champion.prototype.drawHealthBar.call(this, compact);
  }

  /**
   * It looks like it has his health, and it does; it simply cannot take the
   * punishment. Amplifying here rather than shrinking the pool is what keeps
   * the *bar* honest — a decoy with a 1/3-size pool announces itself the
   * moment anyone reads the number over its head.
   */
  takeDamage(damage: number, attacker?: AttackableUnit, type?: DamageType, source?: string): void {
    super.takeDamage(damage * W_CLONE_DAMAGE_TAKEN, attacker, type, source);
  }

  /**
   * A clone does not fall over; it goes out the way it came in.
   *
   * `onExpire` is core's own seam for exactly this — its comment says "for
   * subclasses with a parting gift" — and using it instead of `die` is the
   * whole fix. `die` is only the *killed* path; core funnels four endings
   * through `expire`: killed, timed out, summoner died, summoner removed. A
   * clone that simply ran out its nine seconds was blinking out of existence
   * with nothing, which is what was reported. `Pet`'s own note had already
   * said it — "all three owe the pet its parting effect" — and this class was
   * hooked to one of the three.
   *
   * No latch needed: `expire` opens with `if (this.toRemove) return`, so a
   * killed clone reaching it through `die` and then again through `update`
   * only arrives here once. Two puffs on one spot would tell an enemy they
   * had hit something twice.
   */
  onExpire(): void {
    const puff = new Naruto_W_Smoke(this.ownerUnit ?? this);
    puff.position.set(this.position.x, this.position.y);
    puff.radius = 58;
    this.game.objectManager.addObject(puff);
  }
}

export default class Naruto_W extends api.Spell {
  name = 'Kage Bunshin';
  image = api.asset('spell_naruto_w');
  description =
    'Biến vào làn khói và hiện ra thành <span class="buff">ba bản giống hệt nhau</span>. ' +
    'Phân thân mang đúng thanh máu của Naruto, đánh <span class="damage magic">55%</span> ' +
    'sát thương đòn thường và tồn tại <span class="time">9 giây</span>, nhưng chịu sát thương ' +
    'gấp <b>3</b> lần. <b>Bấm lại</b> để ra lệnh cho phân thân tới vị trí con trỏ.';
  coolDown = W_COOLDOWN_MS;
  manaCost = W_CHAKRA;

  /** The clones this cast put out, so a recast can find them again. */
  private squad: Naruto_W_Clone[] = [];

  get castSpec(): Readonly<CastSpec> {
    return {
      // A second press has to *reach* this spell, and a plain press cannot:
      // the ability is on its eighteen-second cooldown a frame after it
      // starts, so the command press would simply be refused. `RECAST` opens
      // a window the runtime routes those presses through.
      activation: 'RECAST',
      // `POINT`, so the recast arrives carrying a cursor. The first press
      // ignores it — the clones spawn around him wherever he aimed.
      targeting: 'POINT',
      castTimeMs: 0,
      // The window is the clones' own life. `recasts` is deliberately far
      // more than anyone will use: the runtime ends an activation on the
      // *last* recast, and commanding a squad is not something a player
      // should have a budget for. What actually closes this is
      // `maxDurationMs`, when the last clone is gone anyway.
      active: { maxDurationMs: W_LIFETIME_MS, recasts: 99 },
      resource: { commitAt: 'start', refundOn: [] },
      // At `start`, so the cooldown runs *under* the clones rather than
      // beginning when they expire — nine seconds of decoys followed by
      // eighteen of nothing would be a twenty-seven second ability.
      cooldown: { startAt: 'start', durationMs: W_COOLDOWN_MS },
      // They are out of his hands the moment the smoke clears. A stun on
      // Naruto does not un-summon three bodies standing across the lane.
      interrupts: api.enums.SpellForm.INDEPENDENT,
    };
  }

  /**
   * Send them somewhere — the Annie's-Tibbers press.
   *
   * `commandTo` is core's own seam for this and it does the part that is easy
   * to get wrong: while an order is outstanding the pet's own 250ms target
   * scan is skipped, so an autonomous clone standing near an enemy cannot
   * overwrite the order before the player sees it take.
   *
   * Dead and expired clones are dropped from the squad here rather than
   * watched every frame — this is the only moment anyone asks.
   */
  onRecast(): void {
    this.squad = this.squad.filter(clone => !clone.toRemove && !clone.isDead);
    // `this.aimPoint`, **not** the context argument. `onRecast` is handed the
    // context of the *opening* press — `docs/ADDING_SPELLS.md` says so — so
    // reading its cursor sends the squad back to wherever the ability was
    // first cast, every single time, however the player is aiming now.
    const spot = this.aimPoint.copy();
    for (const clone of this.squad) clone.commandTo(spot);
  }

  onActivate(): void {
    const naruto = this.owner as Champion;
    this.squad = [];

    const puff = new Naruto_W_Smoke(naruto);
    puff.position.set(naruto.position.x, naruto.position.y);
    this.game.objectManager.addObject(puff);

    // Half a second of nobody knowing where anyone went. Stealth alone would
    // leave a hole in the smoke where he used to be, so it is paired with
    // untargetability the same way `Pet.setHidden` pairs them — being unseen
    // and being unclickable are two different questions and a decoy needs
    // both answered.
    naruto.addBuff(new api.buffs.Invisible(W_VANISH_MS, naruto, naruto));
    naruto.addBuff(new api.buffs.Untargetable(W_VANISH_MS, naruto, naruto));

    // Fanned around him rather than lined up: three bodies in a row is a
    // pattern, and the middle one is always the first thing anyone clicks.
    const facing = Math.random() * Math.PI * 2;
    for (let index = 0; index < W_CLONES; index++) {
      const angle = facing + ((index + 1) / (W_CLONES + 1)) * Math.PI * 2;
      const spot = naruto.position
        .copy()
        .add(Math.cos(angle) * W_SPAWN_OFFSET, Math.sin(angle) * W_SPAWN_OFFSET);
      const clone = new Naruto_W_Clone(naruto, spot);
      this.squad.push(clone);
      this.game.objectManager.addObject(clone);
    }
  }
}
