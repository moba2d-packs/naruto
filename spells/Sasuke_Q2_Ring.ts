import type { Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { clamp01, snapOut } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;

export const RING_OPEN_MS = 150;
export const RING_HOLD_MS = 110;
export const RING_SNAP_MS = 220;

/**
 * The eye the tomoe come out of.
 *
 * ## Why this object exists
 *
 * The ability used to be three purple triangles that appeared in mid-air and
 * then stopped existing. Both halves of that are what `docs/VFX_STANDARD.md`'s
 * phases section bans: no anticipation, so nothing told the enemy it was
 * coming, and no dissipation, so nothing told anybody it had happened.
 *
 * It also read as nobody in particular. A comma-shaped blade is a shape; a
 * **Sharingan** is a character. Only one champion in this pack has one, the
 * form's own E already draws it on his face, and three tomoe seated in a ring
 * is what that eye *is* — so the ability now fires the eye rather than
 * throwing cutlery, and a player who sees the ring open knows both who cast
 * it and which way it is pointing.
 *
 * ## The three phases, and why the ring outlives the cast
 *
 * open → the iris draws itself and the three tomoe settle into it
 * hold → it stares, which is the telegraph the old version had none of
 * snap → the tomoe tear out and the ring blows apart after them
 *
 * The ring is a separate object from the blades for the reason the scorch is
 * separate from the Rasengan: the phases outlive each other. The tomoe leave
 * on the first frame of `snap` and keep flying; the ring is still coming
 * apart behind them.
 */
export class Sasuke_Q2_Ring extends api.SpellObject {
  /** Where the tomoe are pointed, so the iris faces the same way. */
  heading = 0;
  radius = 46;

  private ageMs = 0;

  private get totalMs(): number {
    return RING_OPEN_MS + RING_HOLD_MS + RING_SNAP_MS;
  }

  update(): void {
    this.ageMs += deltaTime;
    if (this.ageMs >= this.totalMs) this.toRemove = true;
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = this.radius * 2.4;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  draw(): void {
    const eye = this.position;
    const age = this.ageMs;

    // One normalized `t` per phase, never a frame counter — the standard's
    // own rule, and what keeps the three eases independent of the tick rate.
    const opening = clamp01(age / RING_OPEN_MS);
    const snapping = clamp01((age - RING_OPEN_MS - RING_HOLD_MS) / RING_SNAP_MS);

    // Opens with an overshoot, then flies apart. The middle is deliberately
    // still: a telegraph the player cannot fixate on is not a telegraph.
    const scale = snapOut(opening) * (1 + snapping * 1.7);
    const alpha = 255 * (1 - snapping) ** 1.4;
    const r = this.radius * scale;

    push();
    noFill();

    // The iris: two rings, the outer one thinner, so it reads as an eye and
    // not as a targeting circle.
    stroke(190, 40, 60, alpha * 0.85);
    strokeWeight(3.5);
    circle(eye.x, eye.y, r * 2);
    stroke(255, 120, 140, alpha * 0.5);
    strokeWeight(1.5);
    circle(eye.x, eye.y, r * 2.35);

    // The pupil, which is what the tomoe orbit.
    noStroke();
    fill(20, 6, 14, alpha * 0.55);
    circle(eye.x, eye.y, r * 0.9);
    fill(255, 190, 205, alpha * 0.75);
    circle(eye.x, eye.y, r * 0.26);

    // Three tomoe seated at thirds, spinning up as the iris opens and thrown
    // outward with the snap — they leave along the same thirds the blades do.
    const spin = age / 90 + snapping * 3.2;
    for (let mark = 0; mark < 3; mark++) {
      const angle = this.heading + spin + (mark / 3) * Math.PI * 2;
      const seat = r * (0.62 + snapping * 1.1);
      fill(235, 60, 85, alpha);
      circle(eye.x + Math.cos(angle) * seat, eye.y + Math.sin(angle) * seat, r * 0.3);
    }
    pop();
  }
}
