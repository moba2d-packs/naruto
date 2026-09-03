import type { Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { RANGE_BAND, clamp01, snapOut, windIn } from '../spellVfx';
import {
  CRATER_DAMAGE,
  CRATER_RADIUS,
  CRATER_RUBBLE_MS,
  CRATER_SLOW,
  Sakura_R_Crater,
} from './Sakura_R_Crater';

const QRectangle = api.utils.Quadtree.Rectangle;
const dmg = api.text.dmg;

/**
 * Ōkashō — she jumps, and the floor loses.
 *
 * The script:
 *
 *   press a point up to 430 → she leaves the ground, fist up
 *   for about half a second → a ring marks where she is coming down
 *   she lands               → everything inside 175 takes 48
 *   for 3.5 seconds after   → the rubble slows whoever stays in it
 *   the last second         → the floor settles and the rubble goes flat
 *
 * ## Why the ring is drawn from the moment she leaves
 *
 * Because it is the whole counterplay. Gaara's ultimate was rebuilt once for
 * exactly this — "instant quá, ko có animation gì, địch ko né đc" — and the
 * lesson was not "add a travel time", it was that an ability with no middle
 * has nothing for the art to show and nothing for an enemy to answer. Half a
 * second in the air and a ring on the ground is the middle.
 *
 * ## It is her only way in, and that is deliberate
 *
 * She is melee, she has no blink, and Q shoves people *away* from her. Without
 * this she is a champion whose job is to stand next to somebody she has no way
 * of reaching. This is the engage; Q is the peel; and they push in opposite
 * directions on purpose.
 */
export const R_RANGE = RANGE_BAND.ABILITY;
/** Pixels per frame. Fast, but not so fast that the ring cannot be read. */
export const R_LEAP_SPEED = 15;
/**
 * Roughly how long the whole leap takes, in milliseconds.
 *
 * Derived rather than written down, so a retune of the speed cannot leave the
 * tooltip — or the screenshot rig's frame times — quoting a number that is no
 * longer true.
 */
export const R_LEAP_MS = (R_RANGE / R_LEAP_SPEED) * (1000 / 60);
/** How much bigger she is drawn at the top of the jump. See `Airborne`. */
export const R_LEAP_HEIGHT = 34;
/**
 * How long a leap of a given length takes, in milliseconds.
 *
 * A `POINT` cast lands where the cursor is, so most leaps are shorter than
 * the full range and the ring has to close in step with the *actual* fall —
 * a ring timed off the maximum would still be wide open when she lands.
 */
export const leapMsFor = (distance: number): number =>
  (distance / R_LEAP_SPEED) * (1000 / 60);
/** Dissipation of the leap itself, so the crater and the jump overlap. */
export const R_TRAIL_FADE_MS = 160;
export const R_DAMAGE = CRATER_DAMAGE;
export const R_RADIUS = CRATER_RADIUS;
export const R_RUBBLE_MS = CRATER_RUBBLE_MS;
export const R_SLOW = CRATER_SLOW;
/**
 * Ten seconds, and not eleven: core's tempo band caps an ultimate there and
 * `@moba2d/core/testing/tempo` fails the build over a twelfth. "moba2d là
 * game tốc độ cao, chứ ko phải game chờ hồi chiêu" is the report that band
 * exists for.
 */
export const R_COOLDOWN_MS = 10_000;
export const R_CHAKRA = 100;

/**
 * The jump: her in the air, and the ring on the ground under her.
 *
 * It owns the height she is drawn at, and it is the only thing that takes it
 * back off — including when she dies mid-air, which is why the removal sits
 * in `onRemoved` as well as in `land`.
 *
 * Deliberately not `attachTo(her)`: an attached effect drops the frame its
 * anchor dies, and this one has cleanup to do on exactly that frame.
 */
export class Sakura_R_Leap extends api.SpellObject {
  /** Where she is coming down. The ring is drawn here from the first frame. */
  landing = { x: 0, y: 0 };
  /** How long this particular jump should take. See `leapMsFor`. */
  flightMs = R_LEAP_MS;
  /** The dash carrying her. When it is gone, she has landed. */
  dash: InstanceType<typeof api.buffs.Dash> | null = null;

  private ageMs = 0;
  private landedAtMs: number | null = null;
  private lift = new api.units.StatsModifier();
  /** Whether the height above is still applied. `removeModifier` twice shrinks her. */
  private lifted = true;

  onAdded(): void {
    this.lift.height.baseBonus = R_LEAP_HEIGHT;
    this.owner.stats.addModifier(this.lift);
  }

  update(): void {
    this.ageMs += deltaTime;
    this.position.set(this.owner.position.x, this.owner.position.y);

    if (this.landedAtMs === null) {
      // The dash is the clock. Arriving, being knocked out of it and simply
      // running out all end here, which is what makes every ending identical
      // to read — the same shape `Gaara_W_Shell` uses for its shield.
      const flying = this.dash && !this.dash.toRemove;
      if (!flying) this.land();
      return;
    }

    if (this.ageMs - this.landedAtMs >= R_TRAIL_FADE_MS) this.toRemove = true;
  }

  /**
   * Idempotent. Death, a scene exit and the dash ending normally can all
   * arrive in the same frame, and the runtime is allowed to route one ending
   * through more than one path.
   */
  private land(): void {
    if (this.landedAtMs !== null) return;
    this.landedAtMs = this.ageMs;
    this.dropLift();

    // Nothing in this game outlives its caster. A crater opening under a
    // corpse would be the one ability in the pack that does.
    if (this.owner.isDead || this.owner.toRemove) return;

    const crater = new Sakura_R_Crater(this.owner);
    crater.position.set(this.owner.position.x, this.owner.position.y);
    this.game.objectManager.addObject(crater);
  }

  onRemoved(): void {
    this.dropLift();
    super.onRemoved();
  }

  /** Idempotent too, and called from two endings that can both happen. */
  private dropLift(): void {
    if (!this.lifted) return;
    this.lifted = false;
    this.owner.stats.removeModifier(this.lift);
  }

  /** Drawn from her to the landing point, so the box has to hold both. */
  getDisplayBoundingBox(): Rectangle {
    const pad = CRATER_RADIUS + 60;
    return new QRectangle({
      x: Math.min(this.position.x, this.landing.x) - pad,
      y: Math.min(this.position.y, this.landing.y) - pad,
      w: Math.abs(this.landing.x - this.position.x) + pad * 2,
      h: Math.abs(this.landing.y - this.position.y) + pad * 2,
      data: this,
    });
  }

  draw(): void {
    const flying = this.landedAtMs === null;
    const alpha = flying ? 1 : 1 - clamp01((this.ageMs - this.landedAtMs!) / R_TRAIL_FADE_MS);
    if (alpha <= 0) return;

    push();

    // ANTICIPATION, and the counterplay: the ring where she is coming down,
    // at the radius the blast really uses, drawn from the frame she leaves
    // the ground. It tightens as she falls, so "how long have I got" is
    // readable without a number.
    const closing = windIn(clamp01(this.ageMs / Math.max(this.flightMs, 1)));
    noFill();
    stroke(228, 106, 140, 200 * alpha);
    strokeWeight(3);
    circle(this.landing.x, this.landing.y, CRATER_RADIUS * 2);
    stroke(255, 190, 210, 235 * alpha);
    strokeWeight(4);
    circle(this.landing.x, this.landing.y, CRATER_RADIUS * 2 * (1 - 0.72 * closing));

    // Her mark on the floor under the jump: it shrinks and slides back as
    // she rises, and comes home under her as she falls. In a top-down view
    // that is what altitude looks like — the body itself is already drawn
    // bigger by the height modifier.
    //
    // A **pale outline**, not a dark disc. The first cut drew this as a dark
    // shadow, which is invisible on a map whose floor is already almost
    // black — the standard's "avoid both ends of value" rule, met the same
    // way twice in one champion. An outline holds over grass, stone and
    // water alike, and it is what the crater's own rim does.
    const arc = Math.sin(clamp01(this.ageMs / Math.max(this.flightMs, 1)) * Math.PI);
    noFill();
    stroke(236, 176, 198, 200 * alpha);
    strokeWeight(2.5);
    circle(this.position.x, this.position.y + 8 + 14 * arc, 34 * (1 - 0.45 * arc));

    if (!flying) {
      // DISSIPATION of the jump, overlapping the crater's own arrival so
      // there is no frame with neither on screen.
      const out = snapOut(1 - alpha);
      noFill();
      stroke(255, 214, 228, 220 * alpha);
      strokeWeight(4 * alpha);
      circle(this.position.x, this.position.y, 60 + 130 * out);
    }

    pop();
  }
}

export default class Sakura_R extends api.Spell {
  /**
   * Told, not inferred, and `Dash` is the half core refuses to guess: a bot
   * that does not know its engage is an engage saves it as an escape and runs
   * *at* whatever is chasing. `Burst` is what lifts it above an ordinary poke
   * in `scoreSpell`, and `Cc` is the rubble. Every one of the four is a term
   * the scorer actually pays for — a tag it has no term for makes a bot use
   * the ability *less*, which this pack has already shipped once.
   */
  static aiRoles =
    api.enums.SpellRole.Damage |
    api.enums.SpellRole.Burst |
    api.enums.SpellRole.Cc |
    api.enums.SpellRole.Dash;

  name = 'Ōkashō';
  image = api.asset('spell_sakura_r');
  description =
    'Sakura nhảy tới điểm chỉ định và giáng nắm đấm xuống đất: ' +
    `${dmg(48, 'PHYSICAL')} trong vòng tròn, và ` +
    '<span class="buff">làm chậm 35%</span> kẻ địch đứng trên đống đổ nát trong ' +
    '<span class="time">3.5 giây</span>. Vòng tròn hiện ra ngay lúc cô rời mặt đất — ' +
    'có nửa giây để bước ra.';
  coolDown = R_COOLDOWN_MS;
  manaCost = R_CHAKRA;
  targetingMode = 'POINT' as const;
  range = R_RANGE;

  /** A grounded champion cannot jump, and should not pay chakra to find out. */
  checkCastCondition(): boolean {
    return api.buffs.Dash.CanDash(this.owner);
  }

  onSpellCast(): void {
    // `getVectorWithMaxRange`, not `getVectorWithRange`. The latter always
    // returns a point at *exactly* the range — right for a `DIRECTION` cast
    // like Gaara's line, and wrong here: this is `POINT`, the player chose a
    // distance, and flinging her 430 past somebody standing at 150 is the
    // ability ignoring half of what was pressed. Caught by a test, which is
    // the only place the difference is visible.
    const to = api.utils.VectorUtils.getVectorWithMaxRange(
      this.owner.position,
      this.aimPoint,
      R_RANGE
    ).to;
    const flightMs = leapMsFor(this.owner.position.dist(to));

    const leap = new Sakura_R_Leap(this.owner);
    leap.position.set(this.owner.position.x, this.owner.position.y);
    leap.landing = { x: to.x, y: to.y };
    leap.flightMs = flightMs;

    const jump = new api.buffs.Dash(flightMs + 400, this.owner, this.owner);
    jump.image = this.image;
    jump.dashDestination = to;
    jump.dashSpeed = R_LEAP_SPEED;
    jump.showTrail = false;
    leap.dash = jump;
    this.owner.addBuff(jump);

    this.game.objectManager.addObject(leap);
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
