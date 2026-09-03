import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { RANGE_BAND, impactBurst, rgba } from '../spellVfx';
import { Sasuke_Q2_Ember } from './Sasuke_Q2_Ember';
import { Sasuke_Q2_Ring } from './Sasuke_Q2_Ring';

const QRectangle = api.utils.Quadtree.Rectangle;
const dmg = api.text.dmg;

/**
 * Yasaka Magatama — Susanoo fires the Sharingan itself.
 *
 *   press  → an eye opens in front of the armour, three tomoe seated in it
 *   ~260ms → the tomoe tear out along the spread and the ring blows apart
 *   flight → each spins, pierces, and marks whoever it passes through
 *   end    → whatever reaches full range unwinds into embers
 *
 * ## What it used to be, and why that was the problem
 *
 * "Three chakra commas thrown as one cross" — three purple triangles that
 * appeared in mid-air, dealt damage, and stopped existing. Reported as *"lưỡi
 * kiếm hình dấu phẩy? nghe phèn vl"*, and the complaint is right twice over:
 *
 * - **It broke the phases rule.** No anticipation, so nothing told the enemy
 *   it was coming; no dissipation, so nothing told anybody it had happened.
 *   `docs/VFX_STANDARD.md` names both, and this ability had neither.
 * - **It read as nobody.** A comma-shaped blade is a *shape*. Three tomoe in
 *   a ring is a **Sharingan**, which exactly one champion in this pack has,
 *   which the form's own E already draws on his face, and which is what a
 *   magatama has always been a picture of. The ability was named after the
 *   eye and drawn as cutlery.
 *
 * So it fires the eye. Same three projectiles and the same spread — the
 * choice between hitting one target with one blade and a line with all three
 * is still the ability — but the player now sees who cast it and where it is
 * pointed before anything leaves.
 */
export const Q2_DAMAGE = 28;
export const Q2_RANGE = RANGE_BAND.UPGRADED;
export const Q2_SPEED = 13;
export const Q2_SPREAD = 0.28;
export const Q2_COOLDOWN_MS = 7_000;
export const Q2_CHAKRA = 50;
/**
 * How long the eye holds before the tomoe leave.
 *
 * Long enough to be a telegraph and short enough not to be a cast time: the
 * blades are still fired from `onSpellCast`, and this is the ring's own
 * animation running ahead of them. A player who has seen it once reads the
 * direction off the iris before the first tomoe moves.
 */
export const Q2_TELEGRAPH_MS = 150;
/** How far in front of the armour the eye opens. */
export const Q2_RING_OFFSET = 62;

/** The purple this ability is drawn in, so the ring, the blade and the embers agree. */
export const Q2_CHAKRA_VIOLET = [200, 150, 255] as const;

export class Sasuke_Q2_Object extends api.MissileSpellObject {
  speed = Q2_SPEED;
  size = 34;
  damage = Q2_DAMAGE;
  /**
   * Each blade pierces. Three single-target shots was the version that could
   * not clear anything: a wave stands three abreast and a comma that stopped
   * on the first body reached one minion per blade. Piercing is also what
   * makes the spread a *choice* — one target eats one blade, a line eats all
   * three of them all the way down.
   */
  maxHitCount = Infinity;

  private spin = 0;
  private burst = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    rgba(Q2_CHAKRA_VIOLET, 0.9),
    0.5
  );
  /** Latched, so the ending fires once — the trap Naruto's Q2 hit at max range. */
  private spent = false;

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

  /**
   * The ending, for the shot that hits nothing.
   *
   * A piercing blade is the one case where the flight never tells you where
   * it stopped — every other ability in this kit ends on a body. `onRemoved`
   * rather than a range check because the runtime owns the ending, and
   * latched because a cancel can arrive after a normal removal.
   */
  onRemoved(): void {
    super.onRemoved?.();
    if (this.spent) return;
    this.spent = true;
    const ember = new Sasuke_Q2_Ember(this.owner);
    ember.position.set(this.position.x, this.position.y);
    ember.radius = this.size * 0.9;
    ember.spin = this.spin;
    this.game.objectManager.addObject(ember);
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

  /**
   * A tomoe: a round head with a tail riding a circle *around* it, tapering
   * to a point.
   *
   * The proportions came off `tools/preview-shape.mjs` rather than out of the
   * air — the first construction spiralled the tail outward and rendered four
   * lopsided crescents, which is exactly the failure that harness exists for
   * (`Kurama Arms` shipped twice looking nothing like an arm). Keeping the
   * tail on a *constant* radius and tapering only its width is what makes it
   * a comma instead of a blob.
   */
  private tomoe(cx: number, cy: number, r: number, phase: number, alpha: number): void {
    const orbit = r * 1.36;
    const steps = 11;
    fill(...Q2_CHAKRA_VIOLET, alpha);
    circle(cx + Math.cos(phase) * orbit, cy + Math.sin(phase) * orbit, r * 2);
    // The tail, as a fan of shrinking discs along the orbit. Discs rather
    // than a polygon because they overlap into a smooth taper at any size and
    // cost nothing to get right.
    for (let step = 1; step <= steps; step++) {
      const t = step / steps;
      const angle = phase + t * Math.PI * 1.5;
      fill(...Q2_CHAKRA_VIOLET, alpha * (1 - t * 0.15));
      circle(
        cx + Math.cos(angle) * orbit,
        cy + Math.sin(angle) * orbit,
        r * 2 * (1 - t) ** 1.0
      );
    }
  }

  draw(): void {
    const mark = this.position;
    push();
    noStroke();

    // The chakra it is riding in, so a fast blade still leaves something on
    // the retina between frames.
    fill(120, 70, 200, 60);
    circle(mark.x, mark.y, this.size * 1.9);

    // Two after-images a third of a turn behind, which is what turns a
    // spinning shape into a *spinning* shape at this speed.
    this.tomoe(mark.x, mark.y, this.size * 0.3, this.spin - 0.9, 70);
    this.tomoe(mark.x, mark.y, this.size * 0.32, this.spin - 0.45, 130);
    this.tomoe(mark.x, mark.y, this.size * 0.34, this.spin, 240);

    fill(250, 240, 255, 235);
    circle(mark.x, mark.y, this.size * 0.22);
    pop();
  }
}

export default class Sasuke_Q2 extends api.Spell {
  name = 'Yasaka Magatama';
  image = api.asset('spell_sasuke_q2');
  description =
    `Mở <b>con mắt Sharingan</b> trước mặt, rồi bắn <b>ba tomoe</b> xé ra khỏi vòng mắt ` +
    `theo hình chữ thập. Mỗi tomoe <span class="buff">xuyên qua</span> mọi thứ trên đường ` +
    `và gây ${dmg(Q2_DAMAGE, 'MAGIC')}.`;
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

    // The eye, in front of him rather than on him: it is what the blades come
    // out of, so it has to sit where they leave from. Its own clock outlives
    // this cast — see `Sasuke_Q2_Ring`.
    const ring = new Sasuke_Q2_Ring(this.owner);
    ring.position.set(
      this.owner.position.x + Math.cos(heading) * Q2_RING_OFFSET,
      this.owner.position.y + Math.sin(heading) * Q2_RING_OFFSET
    );
    ring.heading = heading;
    this.game.objectManager.addObject(ring);

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
