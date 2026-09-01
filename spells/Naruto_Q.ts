import type { AttackableUnit } from '@moba2d/core/content/types';
import { api } from '../packApi';

/**
 * Rasengan — a sphere of chakra ground into whoever it reaches.
 *
 * Short and fast rather than long and slow: it is the ability that closes a
 * gap Naruto's basic attacks cannot, so its reach is a step and a half and it
 * arrives almost immediately. The slow is what makes the follow-up land.
 */
export const Q_DAMAGE = 26;
export const Q_RANGE = 300;
export const Q_SPEED = 19;
export const Q_SLOW_PERCENT = 0.35;
export const Q_SLOW_MS = 1_200;
export const Q_COOLDOWN_MS = 7_000;
export const Q_CHAKRA = 35;

export class Naruto_Q_Object extends api.MissileSpellObject {
  speed = Q_SPEED;
  size = 34;
  damage = Q_DAMAGE;
  maxHitCount = 1;

  /** Spin phase, so the shell visibly grinds rather than sliding along. */
  private spin = 0;

  update(): void {
    super.update();
    this.spin += 0.4;
  }

  onHit(target: AttackableUnit): void {
    target.takeDamage(this.damage, this.owner);
    const slow = new api.buffs.Slow(Q_SLOW_MS, this.owner, target);
    slow.percent = Q_SLOW_PERCENT;
    target.addBuff(slow);
  }

  draw(): void {
    const orb = this.position;
    push();
    noStroke();
    fill(90, 170, 255, 70);
    circle(orb.x, orb.y, this.size * 1.6);
    fill(130, 200, 255, 210);
    circle(orb.x, orb.y, this.size);
    // Two counter-rotating arcs read as a sphere being spun; a single ring
    // reads as a bubble.
    stroke(225, 245, 255, 230);
    strokeWeight(3);
    noFill();
    arc(orb.x, orb.y, this.size * 0.78, this.size * 0.78, this.spin, this.spin + 2.4);
    arc(orb.x, orb.y, this.size * 0.5, this.size * 0.5, -this.spin * 1.5, -this.spin * 1.5 + 2.0);
    pop();
  }
}

export default class Naruto_Q extends api.Spell {
  name = 'Rasengan';
  description =
    'Nghiền một khối chakra xoáy vào mục tiêu đầu tiên, gây <span class="damage">26</span> ' +
    'sát thương và làm chậm <b>35%</b> trong 1.2 giây.';
  coolDown = Q_COOLDOWN_MS;
  manaCost = Q_CHAKRA;
  targetingMode = 'DIRECTION' as const;
  range = Q_RANGE;

  onSpellCast(): void {
    const shot = new Naruto_Q_Object(this.owner);
    shot.destination = api.utils.VectorUtils.getVectorWithRange(
      this.owner.position,
      this.aimPoint,
      Q_RANGE
    ).to;
    this.game.objectManager.addObject(shot);
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
