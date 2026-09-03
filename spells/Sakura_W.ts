import type {
  AttackableUnit,
  CastContext,
  CastSpec,
  Rectangle,
  TargetingRequest,
} from '@moba2d/core/content/types';
import { api } from '../packApi';
import { RANGE_BAND, clamp01, snapOut } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;
const heal = api.text.heal;

/**
 * Shōsen Jutsu — she puts a hand out and mends somebody.
 *
 * The script:
 *
 *   press on an ally (or herself)  → a cord of chakra runs from her palm
 *   0.16s later it arrives         → they are healed at once
 *   and for the next 2 seconds     → a little more, every half second
 *   if they were under half health → the first half is worth a good deal more
 *
 * ## The first healing ability in this pack, which is the point of her
 *
 * Naruto, Sasuke and Gaara are three ways of removing somebody. Nothing in
 * the pack put a single point of health back, and nothing in it could be
 * *aimed at a friend* — `targetTeam: 'ALLY'` had no callers at all. That is
 * the hole this champion is here to fill, and this is the ability that fills
 * it.
 *
 * ## Why the heal waits 0.16s
 *
 * Because the cord has to get there. The standard's fourth legibility rule is
 * that the motion has to agree with the effect, and a green number that pops
 * before the chakra has left her hand is the picture arriving after the
 * game. A tenth of a second is not a gameplay tax; it is the difference
 * between an animation and a decoration.
 *
 * ## The bonus for a hurt ally is the decision
 *
 * A flat heal is pressed on cooldown. One that pays half again as much below
 * half health asks a real question every time — spend it now on chip damage,
 * or hold it for the moment somebody is actually about to die. It is also
 * what a medical ninja is *for*.
 */
export const W_RANGE = RANGE_BAND.ABILITY;
export const W_HEAL = 22;
/** Below this share of maximum health, the first half of the mend is worth more. */
export const W_CRITICAL_RATIO = 0.5;
export const W_CRITICAL_HEAL = 33;
/** How long the cord takes to reach — the anticipation, in milliseconds. */
export const W_REACH_MS = 160;
/** The mend that follows the first touch. */
export const W_MEND_MS = 2_000;
export const W_MEND_TICK_MS = 500;
export const W_MEND_TICK = 4;
/**
 * How many mends a full duration actually lands.
 *
 * `ceil - 1`, not `floor`: the loop runs only while the effect is *still
 * alive*, so a tick falling exactly on the last millisecond never fires.
 * Written the way the loop counts rather than the way the arithmetic looks,
 * because the two disagree and the tooltip believes the arithmetic.
 */
export const W_MEND_TICKS = Math.ceil(W_MEND_MS / W_MEND_TICK_MS) - 1;
/** Everything one cast is worth on a healthy ally, and on a dying one. */
export const W_TOTAL_HEAL = W_HEAL + W_MEND_TICK * W_MEND_TICKS;
export const W_CRITICAL_TOTAL_HEAL = W_CRITICAL_HEAL + W_MEND_TICK * W_MEND_TICKS;
/** Dissipation: the mark on the ally fades rather than blinking out. */
export const W_FADE_MS = 260;
export const W_COOLDOWN_MS = 9_000;
export const W_CHAKRA = 55;

/** A body this may be pointed at. Team is checked separately, by the spell. */
export const isMendTarget = (candidate: unknown): candidate is AttackableUnit =>
  candidate instanceof api.units.AttackableUnit &&
  candidate.targetable &&
  !candidate.toRemove &&
  !candidate.isDead;

/**
 * The cord, the first touch and the mend that follows — one object.
 *
 * One object because the three are one act seen at three moments, and the
 * standard is explicit that a hand-off between two objects has to overlap or
 * there is a frame with neither on screen.
 *
 * Anchored to the **ally**, not to Sakura: once the chakra is in them it is
 * theirs, and she is free to walk away. It still dies with them, which is the
 * rule every attached effect in this engine follows.
 *
 * Dark (no `visionRadius`) on purpose: this lands on somebody her own team can
 * already see — `TargetResolver` refused the cast otherwise — so a radius here
 * would light nothing that was not already lit.
 */
export class Sakura_W_Mend extends api.SpellObject {
  target: AttackableUnit;
  /** Told by the spell, so the object never re-decides who was hurt. */
  firstTouch = W_HEAL;

  private ageMs = 0;
  private sinceTick = 0;
  private touched = false;
  /** Set on each mend, so the mark pulses when a number actually lands. */
  private lastMendAtMs = -1e9;
  /** Seeded once: motes that re-roll in `draw()` flicker instead of flowing. */
  private motes: number[] = [];

  constructor(owner: AttackableUnit, target: AttackableUnit) {
    super(owner);
    this.target = target;
    this.position.set(owner.position.x, owner.position.y);
  }

  onAdded(): void {
    for (let mote = 0; mote < 7; mote++) this.motes.push(Math.random());
  }

  update(): void {
    if (this.dropIfAttachmentLost()) return;
    this.position.set(this.target.position.x, this.target.position.y);
    this.ageMs += deltaTime;

    if (!this.touched) {
      if (this.ageMs < W_REACH_MS) return;
      this.touched = true;
      this.target.takeHeal(this.firstTouch, this.owner);
      return;
    }

    const mending = this.ageMs - W_REACH_MS;
    if (mending >= W_MEND_MS + W_FADE_MS) {
      this.toRemove = true;
      return;
    }
    if (mending >= W_MEND_MS) return;

    this.sinceTick += deltaTime;
    while (this.sinceTick >= W_MEND_TICK_MS) {
      this.sinceTick -= W_MEND_TICK_MS;
      this.target.takeHeal(W_MEND_TICK, this.owner);
      this.lastMendAtMs = this.ageMs;
    }
  }

  /** Drawn from her palm all the way to the ally, so the box has to hold both. */
  getDisplayBoundingBox(): Rectangle {
    const ax = this.owner.position.x;
    const ay = this.owner.position.y;
    const bx = this.target.position.x;
    const by = this.target.position.y;
    const pad = 60;
    return new QRectangle({
      x: Math.min(ax, bx) - pad,
      y: Math.min(ay, by) - pad,
      w: Math.abs(bx - ax) + pad * 2,
      h: Math.abs(by - ay) + pad * 2,
      data: this,
    });
  }

  draw(): void {
    const ax = this.owner.position.x;
    const ay = this.owner.position.y;
    const bx = this.target.position.x;
    const by = this.target.position.y;

    push();

    if (!this.touched) {
      // ANTICIPATION: the cord reaching, drawn only as far as it has got.
      const out = snapOut(clamp01(this.ageMs / W_REACH_MS));
      const tx = ax + (bx - ax) * out;
      const ty = ay + (by - ay) * out;
      stroke(58, 122, 84, 150);
      strokeWeight(7);
      line(ax, ay, tx, ty);
      stroke(168, 248, 198, 235);
      strokeWeight(3);
      line(ax, ay, tx, ty);
      noStroke();
      fill(220, 255, 232, 235);
      circle(tx, ty, 13);
      pop();
      return;
    }

    const mending = this.ageMs - W_REACH_MS;
    const leaving = clamp01((mending - W_MEND_MS) / W_FADE_MS);
    const alpha = 1 - leaving;

    // CLIMAX: the cord stays while she keeps her hand out, with motes
    // travelling *into* the ally — the direction the health is going.
    if (mending < W_MEND_MS && !this.owner.isDead) {
      stroke(58, 122, 84, 110 * alpha);
      strokeWeight(5);
      line(ax, ay, bx, by);
      noStroke();
      for (const mote of this.motes) {
        const at = (mote + mending / 900) % 1;
        fill(200, 255, 220, 210 * alpha);
        circle(ax + (bx - ax) * at, ay + (by - ay) * at, 8 - at * 3);
      }
    }

    // The mark on the ally: her seal, and the only place a mend is visible.
    // It swells on the frame a number actually lands, so the pulse and the
    // heal are the same event rather than a decorative loop.
    const sinceMend = clamp01((this.ageMs - this.lastMendAtMs) / 260);
    const body = this.target.animatedValues?.displaySize ?? 40;
    const mark = body * 0.62 + 12 * (1 - sinceMend);
    noFill();
    stroke(168, 248, 198, 235 * alpha);
    strokeWeight(3);
    this.rhombus(bx, by, mark);
    stroke(120, 214, 160, 130 * alpha);
    strokeWeight(2);
    this.rhombus(bx, by, mark * 1.45);

    pop();
  }

  /**
   * The Byakugō rhombus — the mark on her forehead, and this champion's own
   * shape. Every effect in the kit carries it, so a green glow on an ally
   * says *who* healed them, which the colour alone never could.
   */
  private rhombus(x: number, y: number, size: number): void {
    beginShape();
    vertex(x, y - size);
    vertex(x + size * 0.62, y);
    vertex(x, y + size);
    vertex(x - size * 0.62, y);
    endShape(CLOSE);
  }
}

export default class Sakura_W extends api.Spell {
  /**
   * Told, not inferred. Core reads a `UNIT` cast as damage: there is nothing
   * in the shape of an ability that says which team it is pointed at, so an
   * untagged heal is scored as a nuke and pressed on whoever is nearest.
   */
  static aiRoles = api.enums.SpellRole.Heal;

  name = 'Shōsen Jutsu';
  image = api.asset('spell_sakura_w');
  description =
    'Truyền chakra chữa thương cho một <b>đồng minh</b> (hoặc chính mình): hồi ngay ' +
    `${heal(22, ' máu')}, rồi ${heal(4, ' máu')} mỗi ` +
    '<span class="time">0.5 giây</span> trong <span class="time">2 giây</span>. Nếu mục tiêu ' +
    'đang dưới <span class="buff">50% máu</span>, phần hồi ngay tăng lên ' +
    `${heal(33)}.`;
  coolDown = W_COOLDOWN_MS;
  manaCost = W_CHAKRA;
  range = W_RANGE;

  // Public, not `protected`: `Spell` declares it public and TypeScript
  // refuses a narrower override (TS2415). Caught by `typecheck`, and this
  // pack has paid for it once already.
  get castSpec(): Readonly<CastSpec> {
    return {
      activation: 'PRESS',
      targeting: 'UNIT',
      resource: { commitAt: 'release', refundOn: ['TARGET_INVALID', 'OUT_OF_RANGE'] },
      cooldown: { startAt: 'release', durationMs: this.coolDown },
    };
  }

  /**
   * **`targetTeam` is not optional here and never is.** Left off, targeting
   * defaults to `'ANY'` — and a heal that resolves an enemy is a heal handed
   * to the person she is fighting. The same omission on a damage spell is how
   * four abilities in the largest pack shipped able to nuke their own caster.
   */
  get targetingRequest(): Readonly<TargetingRequest> {
    return {
      range: this.range,
      targetTeam: 'ALLY',
      queryCandidates: () => this.game.objectManager.objects,
      isTargetable: candidate => isMendTarget(candidate),
      getTargetInfo: candidate =>
        isMendTarget(candidate)
          ? {
              position: candidate.position,
              teamId: candidate.teamId,
              selectionRadius: candidate.animatedValues?.displaySize
                ? candidate.animatedValues.displaySize / 2
                : candidate.collisionRadius,
            }
          : null,
    };
  }

  /**
   * The key-press path already runs `TargetResolver` and hands a resolved
   * context in. A cast driven any other way — a bot, a script — arrives with
   * no target at all, and a `UNIT` spell handed nothing declines silently.
   * Resolving here is what makes the two paths the same ability.
   */
  press(context: CastContext): boolean {
    if (context.target !== undefined) return super.press(context);
    const resolved = api.combat.TargetResolver.resolve('UNIT', {
      ...context,
      casterTeamId: this.owner.teamId,
      ...this.targetingRequest,
    });
    return resolved.ok ? super.press(resolved.context) : false;
  }

  checkCastCondition(): boolean {
    return this.isMendable(this.castContext?.target);
  }

  onSpellCast(context: CastContext): void {
    const ally = context.target;
    if (!this.isMendable(ally)) return;

    const max = ally.stats.maxHealth.value;
    const hurt = max > 0 && ally.stats.health.value / max < W_CRITICAL_RATIO;

    const mend = new Sakura_W_Mend(this.owner, ally);
    mend.firstTouch = hurt ? W_CRITICAL_HEAL : W_HEAL;
    // Anchored to the ally: the chakra is theirs once it is in them, and she
    // is free to walk away from her own heal.
    mend.attachTo(ally);
    this.game.objectManager.addObject(mend);
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }

  /**
   * Team, sight and reach, asked again at the moment it matters.
   *
   * `TargetResolver` already checked all three at the press. This is the
   * frame the payload actually lands on, which is not the same frame — an
   * ally can die, walk out or be hidden in between.
   */
  private isMendable(target: unknown): target is AttackableUnit {
    return (
      isMendTarget(target) &&
      target.teamId === this.owner.teamId &&
      api.combat.Vision.canSee(this.owner, target) &&
      api.combat.Reach.withinRange(this.range, this.owner, target)
    );
  }
}
