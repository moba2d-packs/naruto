import type { Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { clamp01 } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;

export const TRACE_MS = 620;

/**
 * The line the arrow was on, left behind after it is gone.
 *
 * Indra's Arrow was the fastest thing in the pack by half again and one of
 * the smallest, and it ended by not existing — so a player who blinked saw a
 * champion take damage and nothing else. Reported as *"nhanh và khó thấy
 * quá"*. Slowing it was half the answer; this is the other half, and the
 * larger one: the arrow could not be seen because **it left nothing**.
 *
 * A trace is not a longer arrow. It is the dissipation phase
 * `docs/VFX_STANDARD.md` asks every effect for, in the shape this particular
 * effect needs — the ability is a *line*, so what has to survive the shot is
 * the line. It also does the one job the flight cannot: on a shot that
 * pierces everything and stops at max range, "it came from there and ended
 * here" is information the player has no other way to get.
 */
export class Sasuke_E2_Trace extends api.SpellObject {
  from = { x: 0, y: 0 };
  to = { x: 0, y: 0 };
  width = 42;

  private ageMs = 0;

  update(): void {
    this.ageMs += deltaTime;
    if (this.ageMs >= TRACE_MS) this.toRemove = true;
  }

  getDisplayBoundingBox(): Rectangle {
    // The whole line, not the object's own point: this thing *is* its extent,
    // and a box around the midpoint would cull it whenever the camera held
    // one end and not the other.
    const x = Math.min(this.from.x, this.to.x) - this.width;
    const y = Math.min(this.from.y, this.to.y) - this.width;
    return new QRectangle({
      x,
      y,
      w: Math.abs(this.to.x - this.from.x) + this.width * 2,
      h: Math.abs(this.to.y - this.from.y) + this.width * 2,
      data: this,
    });
  }

  draw(): void {
    const t = clamp01(this.ageMs / TRACE_MS);
    // Thins before it fades. A line that only loses alpha reads as a fog
    // bank; one that narrows reads as something closing.
    const alpha = 210 * (1 - t) ** 1.8;
    const thickness = this.width * (1 - t * 0.75);

    push();
    strokeCap(ROUND);
    stroke(140, 165, 255, alpha * 0.45);
    strokeWeight(thickness);
    line(this.from.x, this.from.y, this.to.x, this.to.y);
    stroke(225, 238, 255, alpha);
    strokeWeight(thickness * 0.28);
    line(this.from.x, this.from.y, this.to.x, this.to.y);
    pop();
  }
}
