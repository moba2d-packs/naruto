import type { AttackableUnit } from '@moba2d/core/content/types';
import { api } from '../packApi';

const Dash = api.buffs.Dash;

/**
 * Kurama Arms — an arm of chakra thrown out to drag someone back.
 *
 * The form's answer to the base kit's Kage Bunshin: instead of two bodies
 * that fight for him, one reach that decides *where* the fight happens. The
 * pull is a `Dash` on the victim, which is what makes it a real displacement
 * — it takes their movement away, it is interrupted by everything else that
 * interrupts one, and it walks them in rather than teleporting them.
 */
export const W2_DAMAGE = 20;
export const W2_RANGE = 760;
export const W2_SPEED = 24;
export const W2_PULL_SPEED = 20;
export const W2_PULL_DURATION_MS = 900;
export const W2_COOLDOWN_MS = 10_000;
export const W2_CHAKRA = 40;

export class Naruto_W2_Object extends api.MissileSpellObject {
  speed = W2_SPEED;
  size = 22;
  damage = W2_DAMAGE;
  maxHitCount = 1;

  onHit(target: AttackableUnit): void {
    target.takeDamage(this.damage, this.owner);

    // Grounding blocks a unit dashing under its own power; a displacement
    // someone else applies still has to ask, because `CanDash` is also what
    // refuses a target already mid-displacement.
    if (!Dash.CanDash(target)) return;
    target.stopMovement?.();
    target.markDisplaced?.();
    const reeled = new Dash(W2_PULL_DURATION_MS, this.owner, target);
    reeled.dashDestination = this.owner.position.copy();
    reeled.dashSpeed = W2_PULL_SPEED;
    target.addBuff(reeled);
  }

  draw(): void {
    // The arm reaches back to Naruto, so it is drawn as a span between two
    // moving points rather than a blob at its own centre.
    const tip = this.position;
    const root = this.owner.position;
    push();
    stroke(255, 190, 60, 210);
    strokeWeight(9);
    line(root.x, root.y, tip.x, tip.y);
    stroke(255, 240, 190, 230);
    strokeWeight(3);
    line(root.x, root.y, tip.x, tip.y);
    noStroke();
    fill(255, 210, 110, 235);
    circle(tip.x, tip.y, this.size);
    pop();
  }
}

export default class Naruto_W2 extends api.Spell {
  name = 'Kurama Arms';
  image = api.asset('spell_naruto_w2');
  description =
    'Vươn một cánh tay chakra, gây <span class="damage">20</span> sát thương và <b>kéo</b> ' +
    'mục tiêu trúng đầu tiên về phía mình.';
  coolDown = W2_COOLDOWN_MS;
  manaCost = W2_CHAKRA;
  targetingMode = 'DIRECTION' as const;
  range = W2_RANGE;

  onSpellCast(): void {
    const arm = new Naruto_W2_Object(this.owner);
    arm.destination = api.utils.VectorUtils.getVectorWithRange(
      this.owner.position,
      this.aimPoint,
      W2_RANGE
    ).to;
    this.game.objectManager.addObject(arm);
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
