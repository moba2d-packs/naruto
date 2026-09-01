import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';

const QRectangle = api.utils.Quadtree.Rectangle;

/**
 * Bijuudama — the heaviest single line of damage in this pack.
 *
 * It replaces Sage Mode, and the swap is the point: the base kit's E is a
 * standing buff that makes everything else better, while the form's E is one
 * committed shot that ends a fight. It pierces, because a Tailed Beast Bomb
 * stopping at the first minion would be the one thing nobody would believe.
 */
export const E2_DAMAGE = 55;
export const E2_RANGE = 900;
export const E2_SPEED = 13;
export const E2_SIZE = 64;
export const E2_COOLDOWN_MS = 18_000;
export const E2_CHAKRA = 90;

export class Naruto_E2_Object extends api.MissileSpellObject {
  speed = E2_SPEED;
  size = E2_SIZE;
  damage = E2_DAMAGE;
  // Pierces everything on the line. Left at the inherited `Infinity` would be
  // the same behaviour, but stating it is what stops a later "sensible
  // default" edit from silently making this a single-target shot.
  maxHitCount = Infinity;

  private pulse = 0;

  update(): void {
    super.update();
    this.pulse += 0.18;
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = E2_SIZE;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  onHit(target: AttackableUnit): void {
    target.takeDamage(this.damage, this.owner);
  }

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
  description =
    'Nén một quả cầu vĩ thú rồi bắn thẳng, <b>xuyên qua</b> mọi kẻ địch trên đường và gây ' +
    '<span class="damage">55</span> sát thương.';
  coolDown = E2_COOLDOWN_MS;
  manaCost = E2_CHAKRA;
  targetingMode = 'DIRECTION' as const;
  range = E2_RANGE;

  onSpellCast(): void {
    const bomb = new Naruto_E2_Object(this.owner);
    bomb.destination = api.utils.VectorUtils.getVectorWithRange(
      this.owner.position,
      this.aimPoint,
      E2_RANGE
    ).to;
    this.game.objectManager.addObject(bomb);
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
