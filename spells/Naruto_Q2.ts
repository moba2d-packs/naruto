import type {
  AttackableUnit,
  CastContext,
  CastSpec,
  Rectangle,
} from '@moba2d/core/content/types';
import { api } from '../packApi';
import {
  BIJUU_ORANGE,
  RANGE_BAND,
  chakraTrail,
  clamp01,
  impactBurst,
  rgba,
  snapOut,
} from '../spellVfx';
import { Naruto_Q_Charge } from './Naruto_Q_Charge';
import { Naruto_Q2_Scorch } from './Naruto_Q2_Scorch';

const Circle = api.utils.Quadtree.Circle;
const QRectangle = api.utils.Quadtree.Rectangle;
const dmgRange = api.text.dmgRange;
const dmgRangeValue = api.text.dmgRangeValue;

/**
 * Bijuu Rasengan — the form's Q, and the reason the form is worth entering.
 *
 * The base Rasengan has to be walked into someone. This one is *thrown*, and
 * it detonates: the trade for entering Kurama Mode is that the ability which
 * needed a step and a half of reach now covers a screen and hits everyone
 * standing near where it lands.
 */
/**
 * Charged, like the Rasengan it grew out of.
 *
 * The base Q is a hold, so the form's Q being a tap made entering Kurama Mode
 * change how the button *feels* as well as what it does — and the one thing a
 * form should not do is take an interaction away. Holding it now buys the two
 * things the throw is actually about: how hard it lands and how far it goes.
 *
 * `Q2_DAMAGE` and `Q2_SPLASH_DAMAGE` keep their names as the **floor**, so a
 * tapped Bijuu Rasengan is still stronger than a fully charged base Rasengan
 * (48) once its splash lands — `waveclear.test.ts` reads both.
 */
export const Q2_DAMAGE = 26;
export const Q2_MAX_DAMAGE = 46;
export const Q2_SPLASH_DAMAGE = 22;
export const Q2_MAX_SPLASH_DAMAGE = 30;
export const Q2_SPLASH_RADIUS = 150;
export const Q2_MAX_SPLASH_RADIUS = 190;
export const Q2_CHARGE_MS = 900;
/**
 * The floor and the ceiling of the throw.
 *
 * `Q2_RANGE` stays the name the band test reads and stays `UPGRADED`: it is
 * what the ability *can* reach, which is what a preview draws and what the
 * bot's `declaredRange` means. A tap falls short of it.
 */
export const Q2_MIN_RANGE = RANGE_BAND.ABILITY;
export const Q2_RANGE = RANGE_BAND.UPGRADED;

export const q2Damage = (ratio: number): number =>
  Q2_DAMAGE + (Q2_MAX_DAMAGE - Q2_DAMAGE) * clamp01(ratio);
export const q2Splash = (ratio: number): number =>
  Q2_SPLASH_DAMAGE + (Q2_MAX_SPLASH_DAMAGE - Q2_SPLASH_DAMAGE) * clamp01(ratio);
export const q2SplashRadius = (ratio: number): number =>
  Q2_SPLASH_RADIUS + (Q2_MAX_SPLASH_RADIUS - Q2_SPLASH_RADIUS) * clamp01(ratio);
export const q2Range = (ratio: number): number =>
  Q2_MIN_RANGE + (Q2_RANGE - Q2_MIN_RANGE) * clamp01(ratio);
export const Q2_SPEED = 10;
export const Q2_COOLDOWN_MS = 8_000;
export const Q2_CHAKRA = 45;

export class Naruto_Q2_Object extends api.MissileSpellObject {
  speed = Q2_SPEED;
  size = 52;
  damage = Q2_DAMAGE;
  maxHitCount = 1;
  /** Written by the spell on release; the floor is what a tap throws. */
  splashDamage = Q2_SPLASH_DAMAGE;
  splashRadius = Q2_SPLASH_RADIUS;

  trailSystem = chakraTrail(this.owner, rgba(BIJUU_ORANGE.glow, 0.45), 18);

  private burst = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    rgba(BIJUU_ORANGE.mote, 0.9),
    0.42
  );
  private spin = 0;
  /** Rings the blast throws out, eased so the ripple is not a hard pop. */
  private blastAgeMs = -1;

  onAdded(): void {
    super.onAdded();
    this.useParticles(this.burst);
  }

  update(): void {
    super.update();
    this.spin += 0.34;
    if (this.blastAgeMs >= 0) this.blastAgeMs += deltaTime;
  }

  /** Paints well past its own centre, so the culling box has to say so. */
  getDisplayBoundingBox(): Rectangle {
    const reach = this.splashRadius;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  /** Latched so contact and arrival cannot both pay for one throw. */
  private spent = false;

  onHit(target: AttackableUnit): void {
    target.takeDamage(this.damage, this.owner);
    this.blastAgeMs = 0;
    impactBurst(this.burst, target.position, 22, this.splashRadius * 0.55, 15);
    this.detonate(target);
  }

  /**
   * A throw that reaches its range still bursts.
   *
   * Without this the sphere simply stopped existing at maximum range — the
   * player aimed at that spot for a reason, and got a damage number for
   * nobody and an empty floor. Same gap Rasengan had, found the same way: in
   * a match, by throwing one at nothing.
   */
  onRemoved(): void {
    super.onRemoved?.();
    if (this.spent) return;
    this.detonate(null);
  }

  /**
   * `struck` is passed in rather than read back off the missile: unlike a
   * beam, `MissileSpellObject` keeps no record of who it hit, and the direct
   * target must not also be caught by the splash — a centre hit would be
   * worth 56 while a graze was worth 22, which is not what the tooltip says.
   */
  private detonate(struck: AttackableUnit | null): void {
    if (this.spent) return;
    this.spent = true;
    this.blastAgeMs = 0;

    // The blast's own reading, left on the floor after the missile is gone.
    // Without it the ability ends the frame it lands and the only evidence of
    // how wide it reached is a damage number.
    const scorch = new Naruto_Q2_Scorch(this.owner);
    scorch.position.set(this.position.x, this.position.y);
    scorch.radius = this.splashRadius;
    this.game.objectManager.addObject(scorch);

    const caught = this.game.objectManager.queryObjects({
      area: new Circle({
        x: this.position.x,
        y: this.position.y,
        r: this.splashRadius,
      }),
      // No vision filter: this is an area that detonates over whatever it
      // overlaps, so a champion standing in an unlit bush inside the blast
      // must still be hit.
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];
    for (const unit of caught) {
      if (unit === struck) continue;
      unit.takeDamage(this.splashDamage, this.owner);
      // Every unit the splash reached gets its own mark. Grit at the centre
      // would say "something exploded"; grit on each victim says who it hit.
      impactBurst(this.burst, unit.position, 8, 22, 10);
    }
  }

  draw(): void {
    const orb = this.position;
    push();

    // The blast ring, drawn first so the orb stays the focal point. It grows
    // to the real splash radius and fades — a player learns the area from
    // watching it once, which is the whole job of rule 1.
    if (this.blastAgeMs >= 0) {
      const t = clamp01(this.blastAgeMs / 320);
      noFill();
      stroke(255, 170, 80, 220 * (1 - t));
      strokeWeight(6 * (1 - t) + 1);
      const span = Q2_SPLASH_RADIUS * 2 * snapOut(t);
      circle(orb.x, orb.y, span);
    }

    noStroke();
    fill(255, 95, 40, 55);
    circle(orb.x, orb.y, this.size * 1.9);
    fill(255, 145, 45, 195);
    circle(orb.x, orb.y, this.size);
    fill(40, 12, 8, 225);
    circle(orb.x, orb.y, this.size * 0.5);

    noFill();
    stroke(255, 205, 140, 210);
    strokeWeight(2);
    circle(orb.x, orb.y, this.size);
    strokeWeight(4);
    stroke(255, 225, 165, 235);
    arc(orb.x, orb.y, this.size * 0.86, this.size * 0.86, this.spin, this.spin + 2.6);
    arc(orb.x, orb.y, this.size * 0.58, this.size * 0.58, -this.spin * 1.3, -this.spin * 1.3 + 1.9);
    pop();
  }
}

export default class Naruto_Q2 extends api.Spell {
  name = 'Bijuu Rasengan';
  image = api.asset('spell_naruto_q2');
  description =
    `Giữ để nén khối chakra vĩ thú, thả ra ném đi. Gây ` +
    `${dmgRange(Q2_DAMAGE, Q2_MAX_DAMAGE, 'MAGIC')} lên mục ` +
    `tiêu trúng và ${dmgRangeValue(Q2_SPLASH_DAMAGE, Q2_MAX_SPLASH_DAMAGE, 'MAGIC')} ` +
    `cho kẻ địch xung quanh. Nén càng lâu, <span class="buff">càng mạnh và càng xa</span>.`;
  coolDown = Q2_COOLDOWN_MS;
  manaCost = Q2_CHAKRA;
  range = Q2_RANGE;

  private forming: Naruto_Q_Charge | null = null;
  private ratio = 0;

  get castSpec(): Readonly<CastSpec> {
    return {
      activation: 'HOLD_RELEASE',
      targeting: 'DIRECTION',
      castTimeMs: 0,
      // `releaseAtMax: true` — the runtime throws it at full charge rather
      // than cancelling, which is also what lets a bot hold to the top
      // safely. See `Spell.aiChargeReleaseAtMs`.
      charge: { maxDurationMs: Q2_CHARGE_MS, releaseAtMax: true },
      resource: { commitAt: 'release', refundOn: ['STUN', 'SILENCE', 'DEATH', 'PLAYER_CANCEL'] },
      cooldown: { startAt: 'release', durationMs: Q2_COOLDOWN_MS },
      interrupts: api.enums.SpellForm.AIMED,
    };
  }

  onCastStart(): void {
    this.ratio = 0;
    const forming = new Naruto_Q_Charge(this.owner);
    forming.aim = { x: this.aimPoint.x, y: this.aimPoint.y };
    forming.maxRadius = 34;
    // The orb has to be the colour of the thing it becomes.
    forming.palette = BIJUU_ORANGE;
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

    const shot = new Naruto_Q2_Object(this.owner);
    shot.damage = q2Damage(ratio);
    shot.splashDamage = q2Splash(ratio);
    shot.splashRadius = q2SplashRadius(ratio);
    shot.destination = api.utils.VectorUtils.getVectorWithRange(
      this.owner.position,
      this.aimPoint,
      q2Range(ratio)
    ).to;
    this.game.objectManager.addObject(shot);
  }

  onCancel(): void {
    this.clearForming();
  }

  onComplete(): void {
    this.clearForming();
  }

  /** Idempotent: a hold can route through release and complete both. */
  private clearForming(): void {
    if (!this.forming) return;
    this.forming.toRemove = true;
    this.forming = null;
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
