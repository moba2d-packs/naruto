import type { Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { SIGHT, clamp01 } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;

export const EMBER_MS = 520;

/**
 * How a tomoe stops.
 *
 * It used to stop by not being there any more — the missile reached its range
 * and the object was gone on that frame, which `docs/VFX_STANDARD.md` says
 * reads as a dropped frame rather than as an ending. Naruto's Q2 already hit
 * this exact bug once at max range and got a burst; this is the same fix in
 * the shape the ability calls for.
 *
 * A tomoe does not explode. It **unwinds**: the tail lets go of the head and
 * both spin apart into embers. That is also the reading the player needs at
 * the end of a *piercing* shot, where "it stopped here" is the one piece of
 * information the flight itself never gives — every other ability in this kit
 * ends on a body.
 */
export class Sasuke_Q2_Ember extends api.SpellObject {
  /** A blade that spent itself at the end of its line still lit the ground. */
  visionRadius = SIGHT.MARK;

  radius = 30;
  spin = 0;

  private ageMs = 0;

  update(): void {
    this.ageMs += deltaTime;
    if (this.ageMs >= EMBER_MS) this.toRemove = true;
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = this.radius * 3;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  draw(): void {
    const at = this.position;
    const t = clamp01(this.ageMs / EMBER_MS);
    // Eased out rather than linear: it lets go quickly and drifts slowly,
    // which is what unwinding looks like and what a linear fade does not.
    const alpha = 235 * (1 - t) ** 2;
    const spread = this.radius * (0.5 + t * 1.6);

    push();
    noStroke();
    for (let shard = 0; shard < 5; shard++) {
      const angle = this.spin + (shard / 5) * Math.PI * 2 + t * 2.2;
      fill(215, 120, 255, alpha * 0.9);
      circle(
        at.x + Math.cos(angle) * spread,
        at.y + Math.sin(angle) * spread,
        this.radius * 0.34 * (1 - t)
      );
    }
    fill(245, 225, 255, alpha * 0.5);
    circle(at.x, at.y, this.radius * 0.8 * (1 - t));
    pop();
  }
}
