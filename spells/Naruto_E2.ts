import type {
  AttackableUnit,
  CastContext,
  CastSpec,
  Rectangle,
} from '@moba2d/core/content/types';
import { api } from '../packApi';
import {
  BIJUUDAMA_VIOLET,
  RANGE_BAND,
  chakraTrail,
  clamp01,
  impactBurst,
  rgba,
} from '../spellVfx';
import { Naruto_Q_Charge } from './Naruto_Q_Charge';
import { BOOM_DAMAGE, Naruto_E2_Detonation } from './Naruto_E2_Detonation';

const QRectangle = api.utils.Quadtree.Rectangle;
const dmgRange = api.text.dmgRange;
const dmgRangeValue = api.text.dmgRangeValue;

/**
 * Bijuudama — the heaviest single line of damage in this pack.
 *
 * It replaces Sage Mode, and the swap is the point: the base kit's E is a
 * standing buff that makes everything else better, while the form's E is one
 * committed shot that ends a fight. It pierces, because a Tailed Beast Bomb
 * stopping at the first minion would be the one thing nobody would believe.
 */
/**
 * Compressed before it is fired, which is what the anime does with it and
 * what the base Q already does with a Rasengan.
 *
 * The floor is deliberately above a caster minion's 45: a tapped Bijuudama
 * still clears, so charging is a choice about *how much* rather than a tax on
 * the ability working at all. `waveclear.test.ts` reads both ends.
 */
export const E2_DAMAGE = 48;
export const E2_MAX_DAMAGE = 78;
export const E2_MAX_BOOM_DAMAGE = 46;
export const E2_CHARGE_MS = 1_200;
/** `E2_RANGE` stays the band slot the range test reads — it is the ceiling. */
export const E2_MIN_RANGE = RANGE_BAND.UPGRADED;
export const E2_RANGE = RANGE_BAND.ULTIMATE_LINE;
export const E2_SPEED = 9;
export const E2_SIZE = 56;
export const E2_MAX_SIZE = 72;

export const e2Damage = (ratio: number): number =>
  E2_DAMAGE + (E2_MAX_DAMAGE - E2_DAMAGE) * clamp01(ratio);
export const e2Boom = (ratio: number): number =>
  BOOM_DAMAGE + (E2_MAX_BOOM_DAMAGE - BOOM_DAMAGE) * clamp01(ratio);
export const e2Size = (ratio: number): number =>
  E2_SIZE + (E2_MAX_SIZE - E2_SIZE) * clamp01(ratio);
export const e2Range = (ratio: number): number =>
  E2_MIN_RANGE + (E2_RANGE - E2_MIN_RANGE) * clamp01(ratio);
export const E2_COOLDOWN_MS = 9_000;
export const E2_CHAKRA = 90;

export class Naruto_E2_Object extends api.MissileSpellObject {
  speed = E2_SPEED;
  size = E2_SIZE;
  damage = E2_DAMAGE;
  /** Written by the spell on release; the floor is what a tap fires. */
  boomDamage = BOOM_DAMAGE;
  // Pierces everything on the line. Left at the inherited `Infinity` would be
  // the same behaviour, but stating it is what stops a later "sensible
  // default" edit from silently making this a single-target shot.
  maxHitCount = Infinity;

  trailSystem = chakraTrail(this.owner, rgba(BIJUUDAMA_VIOLET.glow, 0.5), 26);

  private burst = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    rgba(BIJUUDAMA_VIOLET.mote, 0.9),
    0.35
  );
  private pulse = 0;

  onAdded(): void {
    super.onAdded();
    this.useParticles(this.burst);
  }

  update(): void {
    super.update();
    this.pulse += 0.14;
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

  /** Everyone the sphere pierced, so the crater does not charge them twice. */
  private pierced: AttackableUnit[] = [];

  onHit(target: AttackableUnit): void {
    target.takeDamage(this.damage, this.owner);
    this.pierced.push(target);
    // It pierces, so every body on the line gets its own mark — this is the
    // only way a player reads how many the shot actually caught.
    impactBurst(this.burst, target.position, 20, 34, 14);
  }

  /**
   * The shot lands rather than expiring. Reached on arrival and on every
   * other removal, so a sphere that is taken out of the world some other way
   * still ends where it stopped instead of blinking out.
   */
  onRemoved(): void {
    super.onRemoved?.();
    if (this.landed) return;
    this.landed = true;
    const boom = new Naruto_E2_Detonation(this.owner);
    boom.position.set(this.position.x, this.position.y);
    boom.damage = this.boomDamage;
    boom.spare = this.pierced;
    this.game.objectManager.addObject(boom);
  }

  private landed = false;

  draw(): void {
    const orb = this.position;
    const breathe = 1 + Math.sin(this.pulse) * 0.06;
    push();
    noStroke();
    fill(120, 40, 190, 55);
    circle(orb.x, orb.y, this.size * 1.7 * breathe);
    fill(60, 20, 110, 200);
    circle(orb.x, orb.y, this.size * breathe);
    fill(20, 5, 30, 245);
    circle(orb.x, orb.y, this.size * 0.62 * breathe);
    stroke(210, 150, 255, 200);
    strokeWeight(2);
    noFill();
    circle(orb.x, orb.y, this.size * 1.15 * breathe);
    pop();
  }
}

export default class Naruto_E2 extends api.Spell {
  name = 'Bijuudama';
  image = api.asset('spell_naruto_e2');
  description =
    `Giữ để nén quả cầu vĩ thú, thả ra bắn thẳng. <span class="buff">Xuyên qua</span> mọi kẻ ` +
    `địch trên đường và gây ${dmgRangeValue(E2_DAMAGE, E2_MAX_DAMAGE, 'MAGIC')} ` +
    `sát thương. Tới cuối đường quả cầu <b>phát nổ</b>, gây thêm ` +
    `${dmgRangeValue(BOOM_DAMAGE, E2_MAX_BOOM_DAMAGE, 'MAGIC')} cho kẻ địch xung ` +
    `quanh chưa trúng đòn xuyên. Nén càng lâu, <span class="buff">càng mạnh và càng xa</span>.`;
  coolDown = E2_COOLDOWN_MS;
  manaCost = E2_CHAKRA;
  range = E2_RANGE;

  private forming: Naruto_Q_Charge | null = null;
  private ratio = 0;

  get castSpec(): Readonly<CastSpec> {
    return {
      activation: 'HOLD_RELEASE',
      targeting: 'DIRECTION',
      castTimeMs: 0,
      // Fires itself at the top rather than cancelling, which is also what
      // lets a bot hold to full charge safely — see `Spell.aiChargeReleaseAtMs`.
      charge: { maxDurationMs: E2_CHARGE_MS, releaseAtMax: true },
      resource: { commitAt: 'release', refundOn: ['STUN', 'SILENCE', 'DEATH', 'PLAYER_CANCEL'] },
      cooldown: { startAt: 'release', durationMs: E2_COOLDOWN_MS },
      interrupts: api.enums.SpellForm.AIMED,
    };
  }

  onCastStart(): void {
    this.ratio = 0;
    const forming = new Naruto_Q_Charge(this.owner);
    forming.aim = { x: this.aimPoint.x, y: this.aimPoint.y };
    // Bigger than either Rasengan's: this is the tailed beast's own bomb, and
    // the thing being compressed should read as the thing that comes out.
    forming.maxRadius = 40;
    forming.palette = BIJUUDAMA_VIOLET;
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

    const bomb = new Naruto_E2_Object(this.owner);
    bomb.damage = e2Damage(ratio);
    bomb.boomDamage = e2Boom(ratio);
    bomb.size = e2Size(ratio);
    bomb.destination = api.utils.VectorUtils.getVectorWithRange(
      this.owner.position,
      this.aimPoint,
      e2Range(ratio)
    ).to;
    this.game.objectManager.addObject(bomb);
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
