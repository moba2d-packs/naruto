import type { Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { SIGHT } from '../spellVfx';
import { clamp01, snapOut } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;

export const SCORCH_GROW_MS = 140;
export const SCORCH_HOLD_MS = 380;
export const SCORCH_FADE_MS = 760;

/**
 * What a Bijuu Rasengan leaves on the floor.
 *
 * Purely a reading, on purpose: no damage, no slow, nothing to balance. The
 * blast has already happened and been paid for; what this adds is the one
 * thing the blast could not, which is **time to see how big it was**. A
 * player who watched the scorch fade once aims the next one better, and that
 * is the whole argument in `docs/VFX_STANDARD.md`'s phases section for why
 * dissipation is not decoration.
 *
 * It is a separate object because the missile is gone the instant it
 * connects, and the phases outlive each other — the same split Rasengan's
 * vortex already makes.
 */
export class Naruto_Q2_Scorch extends api.SpellObject {
  /**
   * The scorch Bijuu Rasengan leaves: the same question, in the transformed kit.
   *
   * `FogOfWar` reads `visionRadius` off any object and casts the same
   * wall-aware polygon it casts for a champion, so this one number is the
   * whole feature — and the effect's own lifetime is the window. See
   * `SIGHT` in `spellVfx.ts` for why the bands differ.
   */
  visionRadius = SIGHT.IMPACT;

  radius = 150;

  private ageMs = 0;
  /** Seeded once. `random()` in `draw` boils the embers instead of drifting them. */
  private embers: { angle: number; distance: number; size: number; drift: number }[] = [];

  onAdded(): void {
    for (let ember = 0; ember < 7; ember++) {
      this.embers.push({
        angle: Math.random() * Math.PI * 2,
        distance: 0.3 + Math.random() * 0.6,
        size: 0.5 + Math.random() * 0.6,
        drift: 0.5 + Math.random() * 0.9,
      });
    }
  }

  private get totalMs(): number {
    return SCORCH_GROW_MS + SCORCH_HOLD_MS + SCORCH_FADE_MS;
  }

  update(): void {
    this.ageMs += deltaTime;
    if (this.ageMs >= this.totalMs) this.toRemove = true;
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = this.radius + 24;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  draw(): void {
    const centre = this.position;
    const growing = snapOut(clamp01(this.ageMs / SCORCH_GROW_MS));
    const fading = clamp01((this.ageMs - SCORCH_GROW_MS - SCORCH_HOLD_MS) / SCORCH_FADE_MS);
    const alpha = 1 - fading;
    const span = this.radius * 2 * growing;

    push();
    noStroke();
    // Burnt ground: the fill dies first, and it dies fastest, because a wash
    // that lingers as long as the rim would hide the fight standing in it.
    fill(58, 26, 14, 120 * alpha * alpha);
    circle(centre.x, centre.y, span);
    fill(120, 48, 18, 90 * alpha * alpha);
    circle(centre.x, centre.y, span * 0.62);

    // Embers lifting off, so the ground is visibly cooling rather than the
    // decal simply being turned down.
    for (const ember of this.embers) {
      const lift = ember.drift * fading * this.radius * 0.45;
      const x = centre.x + Math.cos(ember.angle) * span * 0.5 * ember.distance;
      const y = centre.y + Math.sin(ember.angle) * span * 0.5 * ember.distance - lift;
      fill(255, 150 + 60 * (1 - fading), 60, 200 * alpha);
      circle(x, y, this.radius * 0.085 * ember.size * (1 - fading * 0.5));
    }

    // The rim is on the real blast radius and is the last thing to go — it is
    // the part that was stating the area.
    noFill();
    stroke(255, 140, 60, 215 * alpha);
    strokeWeight(2.5);
    circle(centre.x, centre.y, this.radius * 2 * growing);
    pop();
  }
}
