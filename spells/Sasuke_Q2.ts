import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { RANGE_BAND, impactBurst } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;

/**
 * Yasaka Magatama — three chakra commas thrown as one cross.
 *
 *   press  → three blades leave the armour in a spread
 *   each   → hits one enemy and stops
 *
 * Three separate missiles, not one wide shot, because the spread is the
 * ability: a target dead ahead eats one blade, a group eats all three, and
 * the player is choosing between the two every time they aim.
 */
export const Q2_DAMAGE = 26;
export const Q2_RANGE = RANGE_BAND.UPGRADED;
export const Q2_SPEED = 13;
export const Q2_SPREAD = 0.28;
export const Q2_COOLDOWN_MS = 7_000;
export const Q2_CHAKRA = 50;

export class Sasuke_Q2_Object extends api.MissileSpellObject {
  speed = Q2_SPEED;
  size = 34;
  damage = Q2_DAMAGE;
  maxHitCount = 1;

  private spin = 0;
  private burst = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(200, 150, 255, 0.9)',
    0.5
  );

  onAdded(): void {
    super.onAdded();
    this.useParticles(this.burst);
  }

  update(): void {
    super.update();
    this.spin += 0.36;
  }

  onHit(target: AttackableUnit): void {
    target.takeDamage(this.damage, this.owner);
    impactBurst(this.burst, target.position, 12, 24, 11);
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = this.size * 1.6;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  draw(): void {
    const mark = this.position;
    push();
    noStroke();
    fill(120, 70, 200, 60);
    circle(mark.x, mark.y, this.size * 1.6);

    // A comma, not a disc: head plus a tail swept behind the spin, which is
    // the shape the whole ability is named for.
    const tail = this.spin + Math.PI * 0.6;
    fill(180, 120, 255, 235);
    triangle(
      mark.x + Math.cos(tail) * this.size * 0.95,
      mark.y + Math.sin(tail) * this.size * 0.95,
      mark.x + Math.cos(tail - 1.3) * this.size * 0.36,
      mark.y + Math.sin(tail - 1.3) * this.size * 0.36,
      mark.x + Math.cos(tail + 1.3) * this.size * 0.36,
      mark.y + Math.sin(tail + 1.3) * this.size * 0.36
    );
    fill(215, 180, 255, 245);
    circle(mark.x, mark.y, this.size * 0.6);
    fill(250, 240, 255, 240);
    circle(mark.x, mark.y, this.size * 0.26);
    pop();
  }
}

export default class Sasuke_Q2 extends api.Spell {
  name = 'Yasaka Magatama';
  image = api.asset('spell_sasuke_q2');
  description =
    'Phóng <b>ba</b> lưỡi chakra hình dấu phẩy theo hình chữ thập, mỗi lưỡi gây ' +
    '<span class="damage magic">26</span> sát thương cho kẻ địch đầu tiên nó chạm.';
  coolDown = Q2_COOLDOWN_MS;
  manaCost = Q2_CHAKRA;
  targetingMode = 'DIRECTION' as const;
  range = Q2_RANGE;

  onSpellCast(): void {
    const aim = api.utils.VectorUtils.getVectorWithRange(
      this.owner.position,
      this.aimPoint,
      Q2_RANGE
    ).to;
    const heading = Math.atan2(aim.y - this.owner.position.y, aim.x - this.owner.position.x);

    for (const offset of [-Q2_SPREAD, 0, Q2_SPREAD]) {
      const blade = new Sasuke_Q2_Object(this.owner);
      const angle = heading + offset;
      blade.destination = createVector(
        this.owner.position.x + Math.cos(angle) * Q2_RANGE,
        this.owner.position.y + Math.sin(angle) * Q2_RANGE
      );
      this.game.objectManager.addObject(blade);
    }
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
