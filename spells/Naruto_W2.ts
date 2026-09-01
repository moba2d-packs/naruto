import type { AttackableUnit } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { impactBurst } from '../spellVfx';

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
export const W2_SPEED = 16;
export const W2_PULL_SPEED = 20;
export const W2_PULL_DURATION_MS = 900;
export const W2_COOLDOWN_MS = 10_000;
export const W2_CHAKRA = 40;

export class Naruto_W2_Object extends api.MissileSpellObject {
  speed = W2_SPEED;
  size = 22;
  damage = W2_DAMAGE;
  maxHitCount = 1;

  private burst = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(255, 210, 120, 0.9)',
    0.5
  );

  onAdded(): void {
    super.onAdded();
    this.useParticles(this.burst);
  }

  onHit(target: AttackableUnit): void {
    target.takeDamage(this.damage, this.owner);
    impactBurst(this.burst, target.position, 16, 30, 12);

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
    // Three strokes of falling width: a limb with depth, not a wire. The
    // outermost is the widest and dimmest so the bright core reads as the
    // focal line.
    stroke(210, 120, 30, 120);
    strokeWeight(14);
    line(root.x, root.y, tip.x, tip.y);
    stroke(255, 185, 60, 215);
    strokeWeight(8);
    line(root.x, root.y, tip.x, tip.y);
    stroke(255, 245, 200, 235);
    strokeWeight(3);
    line(root.x, root.y, tip.x, tip.y);

    // The hand, with a rim so it holds its silhouette over grass and stone
    // alike — the size floor rule for anything the player has to find.
    noStroke();
    fill(255, 205, 105, 240);
    circle(tip.x, tip.y, this.size * 1.5);
    stroke(120, 60, 10, 200);
    strokeWeight(2);
    noFill();
    circle(tip.x, tip.y, this.size * 1.5);
    pop();
  }
}

export default class Naruto_W2 extends api.Spell {
  name = 'Kurama Arms';
  image = api.asset('spell_naruto_w2');
  description =
    'Vươn một cánh tay chakra, gây <span class="damage magic">20</span> sát thương và ' +
    '<span class="buff">kéo</span> mục tiêu trúng đầu tiên về phía mình.';
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
