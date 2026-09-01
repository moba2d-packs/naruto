import type { AttackableUnit } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { RANGE_BAND, chakraTrail, impactBurst } from '../spellVfx';
import { Sasuke_W_Blaze } from './Sasuke_W_Blaze';

/**
 * Gōkakyū no Jutsu — he breathes a ball of fire down the lane.
 *
 * The script:
 *
 *   press              → a fireball forms at his mouth and rolls forward
 *   enemies it touches → burn, and it keeps going
 *   where it stops     → the ground burns for a few seconds
 *
 * It pierces because a fireball that stopped on the first minion would never
 * reach anything, and the ground it leaves is the actual ability: the damage
 * on the way through is small, and the area denial afterwards is what a
 * player is buying.
 */
export const W_DAMAGE = 18;
export const W_RANGE = RANGE_BAND.ABILITY;
export const W_SPEED = 9;
export const W_SIZE = 54;
export const W_COOLDOWN_MS = 13_000;
export const W_CHAKRA = 60;

export class Sasuke_W_Object extends api.MissileSpellObject {
  speed = W_SPEED;
  size = W_SIZE;
  damage = W_DAMAGE;
  maxHitCount = Infinity;

  trailSystem = chakraTrail(this.owner, 'rgba(255, 120, 40, 0.4)', 22);

  private ageMs = 0;
  private landed = false;
  private burst = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(255, 180, 90, 0.9)',
    0.42
  );

  onAdded(): void {
    super.onAdded();
    this.useParticles(this.burst);
  }

  update(): void {
    super.update();
    this.ageMs += deltaTime;
  }

  onHit(target: AttackableUnit): void {
    target.takeDamage(this.damage, this.owner);
    impactBurst(this.burst, target.position, 12, 26, 12);
  }

  /** Wherever it stopped, it set the ground alight. */
  onRemoved(): void {
    super.onRemoved?.();
    if (this.landed) return;
    this.landed = true;
    const blaze = new Sasuke_W_Blaze(this.owner);
    blaze.position.set(this.position.x, this.position.y);
    this.game.objectManager.addObject(blaze);
  }

  draw(): void {
    const ball = this.position;
    // A rolling boil rather than a steady disc: fire that does not move reads
    // as a painted circle.
    const boil = 1 + Math.sin(this.ageMs / 70) * 0.08;
    push();
    noStroke();
    fill(255, 90, 30, 60);
    circle(ball.x, ball.y, this.size * 1.7 * boil);
    fill(255, 130, 40, 210);
    circle(ball.x, ball.y, this.size * boil);
    fill(255, 200, 110, 235);
    circle(ball.x, ball.y, this.size * 0.6 * boil);
    fill(255, 246, 210, 245);
    circle(ball.x, ball.y, this.size * 0.26 * boil);
    noFill();
    stroke(255, 170, 80, 190);
    strokeWeight(2);
    circle(ball.x, ball.y, this.size);
    pop();
  }
}

export default class Sasuke_W extends api.Spell {
  name = 'Gōkakyū no Jutsu';
  image = api.asset('spell_sasuke_w');
  description =
    'Phun một quả cầu lửa <span class="buff">xuyên qua</span> mọi kẻ địch trên đường, gây ' +
    '<span class="damage magic">18</span> sát thương. Nơi nó dừng lại bốc cháy trong ' +
    '<span class="time">2.6 giây</span>, thiêu <span class="damage magic">7</span> mỗi nửa giây.';
  coolDown = W_COOLDOWN_MS;
  manaCost = W_CHAKRA;
  targetingMode = 'DIRECTION' as const;
  range = W_RANGE;

  onSpellCast(): void {
    const ball = new Sasuke_W_Object(this.owner);
    ball.destination = api.utils.VectorUtils.getVectorWithRange(
      this.owner.position,
      this.aimPoint,
      W_RANGE
    ).to;
    this.game.objectManager.addObject(ball);
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
