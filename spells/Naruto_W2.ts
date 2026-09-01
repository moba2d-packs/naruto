import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { clamp01, impactBurst, snapOut, windIn } from '../spellVfx';

const Dash = api.buffs.Dash;
const QRectangle = api.utils.Quadtree.Rectangle;

/**
 * Kurama Arms — an arm of chakra thrown out to drag someone back.
 *
 * ## Why it is drawn as a limb and not as a beam
 *
 * The first cut was three straight lines of falling width with a circle on
 * the end, and the report was simply *"đang ko giống cánh tay chút nào"*.
 * It was right: a straight taper is a laser, and a circle is a ball. Three
 * things separate an arm from a beam, and it needs all three —
 *
 *   - **it curves.** A limb reaching for something arcs; only a projectile
 *     travels in a perfectly straight line.
 *   - **it has width, drawn as a body.** A ribbon sampled along the curve,
 *     thick at the shoulder and thin at the wrist, not strokes stacked on
 *     one another.
 *   - **it ends in a hand.** Fingers, splayed while it reaches and closed
 *     once it has hold of someone. That state change is also the clearest
 *     signal in the ability: the frame the fingers shut is the frame you
 *     know you were caught.
 *
 * ## Why it retracts instead of vanishing
 *
 * `docs/VFX_STANDARD.md` rule 4: the motion has to agree with the effect. The
 * buff pulls the victim *toward* Naruto, and the arm used to disappear on
 * contact and let them slide in behind it — art saying one thing while the
 * game did another. Now the arm hauls back and the victim comes with it, and
 * that reeling is the dissipation phase as well.
 */
export const W2_DAMAGE = 20;
export const W2_RANGE = 760;
export const W2_SPEED = 16;
export const W2_PULL_SPEED = 20;
export const W2_PULL_DURATION_MS = 900;
export const W2_RETRACT_MS = 620;
export const W2_COOLDOWN_MS = 10_000;
export const W2_CHAKRA = 40;

/**
 * Limb proportions, in world units.
 *
 * Thick on purpose. The first cut was 26 tapering to 11 over 760 units of
 * reach — about ten times longer than it was wide, which is a whip, not an
 * arm. A limb reads at roughly six times its own shoulder width, so these are
 * wider than a champion's body and that is correct: it is a giant's arm.
 */
const W_SHOULDER = 52;
const W_ELBOW = 42;
const W_WRIST = 28;
/** Where the elbow sits along the limb, and how far it swings off the line. */
const ELBOW_AT = 0.45;
const BEND = 0.13;
const SEGMENTS = 20;

export class Naruto_W2_Object extends api.MissileSpellObject {
  speed = W2_SPEED;
  size = 22;
  damage = W2_DAMAGE;
  maxHitCount = 1;
  /** It has to survive its own hit — the reeling is the rest of the ability. */
  removeOnMaxHit = false;
  removeOnArrive = false;

  private grabbed: AttackableUnit | null = null;
  private retractMs = 0;
  private reachedMs = 0;
  private burst = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(255, 210, 120, 0.9)',
    0.5
  );

  onAdded(): void {
    super.onAdded();
    this.useParticles(this.burst);
  }

  update(): void {
    if (this.grabbed) {
      this.retractMs += deltaTime;
      // The hand rides the victim in, so the limb visibly shortens rather
      // than the two sliding past each other.
      this.position.set(this.grabbed.position.x, this.grabbed.position.y);
      if (this.retractMs >= W2_RETRACT_MS) this.toRemove = true;
      return;
    }

    super.update();
    // A throw that caught nobody still has to come back; without this the arm
    // hangs at full stretch at the end of its range for the rest of the match.
    this.reachedMs += deltaTime;
    if (this.reachedMs > (W2_RANGE / W2_SPEED) * 17 + 200) this.toRemove = true;
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
    this.grabbed = target;
  }

  /** The span between two moving points, so not a square around its centre. */
  getDisplayBoundingBox(): Rectangle {
    const root = this.owner.position;
    const tip = this.position;
    const pad = W_SHOULDER * 2;
    const left = Math.min(root.x, tip.x) - pad;
    const top = Math.min(root.y, tip.y) - pad;
    return new QRectangle({
      x: left,
      y: top,
      w: Math.abs(tip.x - root.x) + pad * 2,
      h: Math.abs(tip.y - root.y) + pad * 2,
      data: this,
    });
  }

  /**
   * The limb's centre line: upper arm to elbow, elbow to wrist.
   *
   * Two arcs meeting at a joint rather than one smooth curve, because a
   * single bezier reads as a tentacle however it is bowed — the elbow is what
   * says "arm". The upper arm carries a little curve of its own so the joint
   * is a *bend* and not a corner; a hard angle reads as a bent straw.
   *
   * The bend swings sideways, not "downward": this is a top-down view, so
   * there is no down for it to sag toward, and a sag drawn anyway is what
   * makes a top-down limb look like a rope.
   */
  private spine(t: number): { x: number; y: number } {
    const root = this.owner.position;
    const tip = this.position;
    const dx = tip.x - root.x;
    const dy = tip.y - root.y;
    const length = Math.hypot(dx, dy) || 1;
    const px = -dy / length;
    const py = dx / length;
    // A limb straightens as it hauls something in.
    const slack = this.grabbed ? 1 - clamp01(this.retractMs / W2_RETRACT_MS) : 1;
    const elbowX = root.x + dx * ELBOW_AT + px * length * BEND * slack;
    const elbowY = root.y + dy * ELBOW_AT + py * length * BEND * slack;

    if (t <= ELBOW_AT) {
      const u = t / ELBOW_AT;
      const cx = root.x + (elbowX - root.x) * 0.5 + px * length * 0.03 * slack;
      const cy = root.y + (elbowY - root.y) * 0.5 + py * length * 0.03 * slack;
      const inv = 1 - u;
      return {
        x: inv * inv * root.x + 2 * inv * u * cx + u * u * elbowX,
        y: inv * inv * root.y + 2 * inv * u * cy + u * u * elbowY,
      };
    }
    const u = (t - ELBOW_AT) / (1 - ELBOW_AT);
    const cx = elbowX + (tip.x - elbowX) * 0.5 - px * length * 0.05 * slack;
    const cy = elbowY + (tip.y - elbowY) * 0.5 - py * length * 0.05 * slack;
    const inv = 1 - u;
    return {
      x: inv * inv * elbowX + 2 * inv * u * cx + u * u * tip.x,
      y: inv * inv * elbowY + 2 * inv * u * cy + u * u * tip.y,
    };
  }

  /** Thicker at the shoulder, thinner past the elbow. */
  private widthAt(t: number): number {
    return t <= ELBOW_AT
      ? W_SHOULDER + (W_ELBOW - W_SHOULDER) * (t / ELBOW_AT)
      : W_ELBOW + (W_WRIST - W_ELBOW) * ((t - ELBOW_AT) / (1 - ELBOW_AT));
  }

  draw(): void {
    const extend = this.grabbed ? 1 : snapOut(clamp01(this.reachedMs / 140));
    const fade = this.grabbed ? 1 - windIn(clamp01(this.retractMs / W2_RETRACT_MS)) * 0.45 : 1;

    const spine: { x: number; y: number }[] = [];
    for (let step = 0; step <= SEGMENTS; step++) spine.push(this.spine((step / SEGMENTS) * extend));

    push();
    noStroke();

    // The limb as one body, walked out along one edge and back along the
    // other. Strokes of different weights stacked up cannot taper.
    const layer = (scale: number, r: number, g: number, b: number, a: number): void => {
      fill(r, g, b, a * fade);
      beginShape();
      const emit = (step: number, side: number): void => {
        const t = step / SEGMENTS;
        const here = spine[step];
        const next = spine[Math.min(step + 1, SEGMENTS)];
        const prev = spine[Math.max(step - 1, 0)];
        const nx = -(next.y - prev.y);
        const ny = next.x - prev.x;
        const len = Math.hypot(nx, ny) || 1;
        const half = (this.widthAt(t) / 2) * scale * side;
        vertex(here.x + (nx / len) * half, here.y + (ny / len) * half);
      };
      for (let step = 0; step <= SEGMENTS; step++) emit(step, 1);
      for (let step = SEGMENTS; step >= 0; step--) emit(step, -1);
      endShape(CLOSE);
    };

    layer(1.35, 205, 105, 20, 90);
    layer(1, 255, 172, 50, 235);
    layer(0.38, 255, 238, 190, 215);

    // ── the hand ────────────────────────────────────────────────────────
    const wrist = spine[SEGMENTS];
    const before = spine[SEGMENTS - 2];
    const heading = Math.atan2(wrist.y - before.y, wrist.x - before.x);
    const alongX = Math.cos(heading);
    const alongY = Math.sin(heading);
    const acrossX = -alongY;
    const acrossY = alongX;
    // Splayed while reaching, shut once it has hold. The frame the fingers
    // close is the frame the victim knows they were caught.
    const closed = this.grabbed ? 1 : 0;
    const curl = 1 - closed * 0.65;

    const palmX = wrist.x + alongX * W_WRIST * 0.45;
    const palmY = wrist.y + alongY * W_WRIST * 0.45;
    const halfAcross = W_WRIST * 1.2;
    const halfAlong = W_WRIST * 0.8;
    const knuckleX = palmX + alongX * halfAlong;
    const knuckleY = palmY + alongY * halfAlong;

    /**
     * Fingers are rooted along the *knuckle line* and drawn as near-parallel
     * boxes with round ends. Both halves matter: spokes radiating from one
     * point make a mace, and a triangle that tapers to a point makes a claw.
     */
    const drawFinger = (offset: number, length: number, lean: number, halfWidth: number): void => {
      const rootX = knuckleX + acrossX * offset;
      const rootY = knuckleY + acrossY * offset;
      const angle = heading + lean;
      const fx = Math.cos(angle);
      const fy = Math.sin(angle);
      const sideX = -fy;
      const sideY = fx;
      const tipHalf = halfWidth * 0.82;
      const tipX = rootX + fx * length;
      const tipY = rootY + fy * length;
      beginShape();
      vertex(rootX - sideX * halfWidth, rootY - sideY * halfWidth);
      vertex(tipX - sideX * tipHalf, tipY - sideY * tipHalf);
      vertex(tipX + sideX * tipHalf, tipY + sideY * tipHalf);
      vertex(rootX + sideX * halfWidth, rootY + sideY * halfWidth);
      endShape(CLOSE);
      circle(tipX, tipY, tipHalf * 2);
    };

    fill(255, 200, 85, 240 * fade);
    for (let finger = 0; finger < 4; finger++) {
      const offset = (finger - 1.5) * W_WRIST * 0.62;
      const lean = (finger - 1.5) * 0.16 * curl;
      const reach = W_WRIST * (2.1 - closed * 0.95) * (finger === 0 || finger === 3 ? 0.82 : 1);
      drawFinger(offset, reach, lean, W_WRIST * 0.27);
    }
    // The thumb: off to one side, shorter, thicker. Four symmetrical prongs
    // and nothing else is a fork.
    drawFinger(
      -W_WRIST * 1.25,
      W_WRIST * (1.45 - closed * 0.45),
      -0.85 + closed * 0.45,
      W_WRIST * 0.3
    );

    // Palm last, over the finger roots, and flat — wider across than along.
    // A circle here is a ball on a stick.
    fill(255, 180, 60, 240 * fade);
    beginShape();
    for (let corner = 0; corner < 12; corner++) {
      const theta = (corner / 12) * Math.PI * 2;
      const u = Math.cos(theta) * halfAcross;
      const v = Math.sin(theta) * halfAlong;
      vertex(palmX + acrossX * u + alongX * v, palmY + acrossY * u + alongY * v);
    }
    endShape(CLOSE);
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
