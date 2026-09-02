import type { AttackableUnit, CastContext, CastSpec, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { RANGE_BAND, RASENGAN_BLUE, chakraTrail, clamp01, rgba } from '../spellVfx';
import { Naruto_Q_Charge } from './Naruto_Q_Charge';
import { Naruto_Q_Vortex } from './Naruto_Q_Vortex';

const QRectangle = api.utils.Quadtree.Rectangle;

/**
 * Rasengan — held to gather, released to throw.
 *
 * ## Why a charge and not a press
 *
 * A press gives a player one decision: aim. A charge gives them two, and the
 * second one is the interesting one — hold longer and the sphere is bigger
 * and hits harder, but you are standing there holding it where everyone can
 * see. That is the shape Varus's and Pantheon's Q have, and it is the shape
 * this ability always wanted: the tell *is* the counterplay.
 *
 * `SpellForm.AIMED` because he keeps his feet: a charged shot the champion is
 * physically drawing while free to strafe. Crowd control still ends it — his
 * own hands are what is holding it — but walking does not.
 *
 * ## Three objects, one per phase
 *
 * `docs/VFX_STANDARD.md` requires anticipation, climax and dissipation, and
 * the phases here outlive each other, so each is its own object:
 *
 *   `Naruto_Q_Charge`  the sphere forming at his hand, growing with the hold
 *   `Naruto_Q_Object`  the throw
 *   `Naruto_Q_Vortex`  the spiral left where it burst, which fades
 *
 * The missile does **not** delete itself on contact and then leave nothing
 * behind — that is the exact anti-pattern the standard's phases section was
 * written about, and it is what this ability used to do.
 */
export const Q_MIN_DAMAGE = 18;
/**
 * A fully-charged Rasengan is priced like an ultimate, not like a press.
 *
 * Core's band — abilities 15–35 — is about a button you tap. This one costs a
 * second of standing still holding a visible, growing tell, and 44 was one
 * point short of removing a 45-health caster minion, which is a breakpoint a
 * player *feels* without ever being told it exists: the wave visibly does not
 * die and the ability reads as weak. 48 crosses it on purpose.
 */
export const Q_MAX_DAMAGE = 48;
export const Q_MIN_RADIUS = 26;
export const Q_MAX_RADIUS = 46;
export const Q_MIN_VORTEX = 95;
export const Q_MAX_VORTEX = 165;
export const Q_CHARGE_MS = 1_100;
export const Q_RANGE = RANGE_BAND.ABILITY;
export const Q_SPEED = 11;
export const Q_COOLDOWN_MS = 8_000;
export const Q_CHAKRA = 45;

/** Damage and both radii read off one ratio, so they can never disagree. */
export const chargedDamage = (ratio: number): number =>
  Q_MIN_DAMAGE + (Q_MAX_DAMAGE - Q_MIN_DAMAGE) * clamp01(ratio);
export const chargedRadius = (ratio: number): number =>
  Q_MIN_RADIUS + (Q_MAX_RADIUS - Q_MIN_RADIUS) * clamp01(ratio);
export const chargedVortex = (ratio: number): number =>
  Q_MIN_VORTEX + (Q_MAX_VORTEX - Q_MIN_VORTEX) * clamp01(ratio);

export class Naruto_Q_Object extends api.MissileSpellObject {
  speed = Q_SPEED;
  size = Q_MIN_RADIUS * 2;
  damage = Q_MIN_DAMAGE;
  maxHitCount = 1;
  /** The vortex is what remains; the sphere itself is spent on contact. */
  vortexRadius = Q_MIN_VORTEX;

  trailSystem = chakraTrail(this.owner, rgba(RASENGAN_BLUE.glow, 0.42), 14);

  private spin = 0;
  private shells: number[] = [];

  onAdded(): void {
    super.onAdded();
    for (let shell = 0; shell < 3; shell++) this.shells.push(Math.random() * Math.PI * 2);
  }

  update(): void {
    super.update();
    this.spin += 0.3;
  }

  onHit(target: AttackableUnit): void {
    // The sphere carries no damage of its own any more: everything it does is
    // the burst, so a unit cannot be charged twice for one throw and the
    // number a player sees always matches the area they saw.
    this.burst(target.position);
  }

  /** Also the arrival case — a throw that reaches its range still bursts. */
  onRemoved(): void {
    super.onRemoved?.();
    if (!this.spent) this.burst(this.position);
  }

  private spent = false;

  private burst(at: { x: number; y: number }): void {
    if (this.spent) return;
    this.spent = true;
    const vortex = new Naruto_Q_Vortex(this.owner);
    vortex.position.set(at.x, at.y);
    vortex.radius = this.vortexRadius;
    vortex.damage = this.damage;
    this.game.objectManager.addObject(vortex);
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = this.size;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  draw(): void {
    const orb = this.position;
    push();
    noStroke();
    fill(90, 165, 255, 55);
    circle(orb.x, orb.y, this.size * 1.7);
    fill(120, 195, 255, 195);
    circle(orb.x, orb.y, this.size);
    fill(235, 248, 255, 235);
    circle(orb.x, orb.y, this.size * 0.42);

    noFill();
    stroke(215, 240, 255, 200);
    strokeWeight(2);
    circle(orb.x, orb.y, this.size);
    strokeWeight(3);
    stroke(240, 252, 255, 225);
    for (let shell = 0; shell < this.shells.length; shell++) {
      const phase = this.shells[shell] + this.spin * (shell % 2 === 0 ? 1 : -1.4);
      const span = this.size * (0.82 - shell * 0.18);
      arc(orb.x, orb.y, span, span, phase, phase + 2.2);
    }
    pop();
  }
}

export default class Naruto_Q extends api.Spell {
  name = 'Rasengan';
  image = api.asset('spell_naruto_q');
  description =
    'Giữ để tụ chakra bên tay. Thả ra ném quả cầu đi, nổ thành xoáy gây ' +
    '<span class="damage magic">18–48</span> sát thương và ' +
    '<span class="buff">làm chậm 40%</span> trong <span class="time">1.4 giây</span>. ' +
    'Tụ càng lâu, quả cầu và vùng nổ càng lớn.';
  manaCost = Q_CHAKRA;
  coolDown = Q_COOLDOWN_MS;
  range = Q_RANGE;

  /** The sphere in his hand while the key is down; null the rest of the time. */
  private forming: Naruto_Q_Charge | null = null;
  private ratio = 0;

  get castSpec(): Readonly<CastSpec> {
    return {
      activation: 'HOLD_RELEASE',
      targeting: 'DIRECTION',
      castTimeMs: 0,
      charge: { maxDurationMs: Q_CHARGE_MS, releaseAtMax: true },
      // Billed on release, and refunded if it never got thrown: a hold that a
      // stun cut short must not cost the same as a Rasengan that landed.
      resource: { commitAt: 'release', refundOn: ['STUN', 'SILENCE', 'DEATH', 'PLAYER_CANCEL'] },
      cooldown: { startAt: 'release', durationMs: Q_COOLDOWN_MS },
      interrupts: api.enums.SpellForm.AIMED,
    };
  }

  onCastStart(): void {
    this.ratio = 0;
    const forming = new Naruto_Q_Charge(this.owner);
    forming.aim = { x: this.aimPoint.x, y: this.aimPoint.y };
    forming.maxRadius = Q_MAX_RADIUS;
    forming.palette = RASENGAN_BLUE;
    // Attached so it dies with him rather than hanging in the air over a
    // corpse — the same rule every effect that rides a body follows.
    forming.attachTo(this.owner);
    this.forming = forming;
    this.game.objectManager.addObject(forming);
  }

  onChargeUpdate(_context: CastContext, _elapsedMs: number, ratio: number): void {
    this.ratio = ratio;
    if (!this.forming) return;
    this.forming.ratio = ratio;
    // The orb sits at the hand he is aiming with, so it has to be told where
    // that is every frame. `aimPoint` is the only thing that knows a thumb
    // drag from the finger pressing the button — see `Naruto_Q_Charge.aim`.
    this.forming.aim = { x: this.aimPoint.x, y: this.aimPoint.y };
  }

  onRelease(): void {
    const ratio = this.ratio;
    this.clearForming();

    const shot = new Naruto_Q_Object(this.owner);
    shot.size = chargedRadius(ratio) * 2;
    shot.damage = chargedDamage(ratio);
    shot.vortexRadius = chargedVortex(ratio);
    shot.destination = api.utils.VectorUtils.getVectorWithRange(
      this.owner.position,
      this.aimPoint,
      Q_RANGE
    ).to;
    this.game.objectManager.addObject(shot);
  }

  /** Death, a stun, a scene exit and a normal release all land here. */
  onCancel(): void {
    this.clearForming();
  }

  onComplete(): void {
    this.clearForming();
  }

  private clearForming(): void {
    // Idempotent on purpose: the runtime can route a single hold through
    // `onRelease` and `onComplete` both, and a cancel can arrive after either.
    if (!this.forming) return;
    this.forming.toRemove = true;
    this.forming = null;
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
