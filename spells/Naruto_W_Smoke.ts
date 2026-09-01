import type { Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { clamp01, snapOut } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;

export const SMOKE_GROW_MS = 130;
export const SMOKE_HOLD_MS = 190;
export const SMOKE_FADE_MS = 460;

/**
 * The puff a body vanishes into, and the whole reason the swap works.
 *
 * ## It is cover, not decoration
 *
 * Kage Bunshin only fools anyone if there is a moment where nobody can see
 * which body went where. Without the smoke the clones simply appear beside
 * him and the enemy's eye tracks the one that never moved. So this is sized
 * to actually cover three bodies for a few hundred milliseconds — it is
 * gameplay wearing a visual, not the other way round.
 *
 * Phases per `docs/VFX_STANDARD.md`: it billows out (130ms), sits (190ms),
 * and thins (460ms). The thinning is the longest of the three on purpose —
 * smoke that snapped out of existence would hand the enemy the exact frame to
 * look at.
 */
export class Naruto_W_Smoke extends api.SpellObject {
  radius = 92;

  private ageMs = 0;
  /** Seeded once: `random()` inside `draw` boils instead of drifting. */
  private puffs: { angle: number; distance: number; size: number; drift: number }[] = [];

  onAdded(): void {
    for (let puff = 0; puff < 9; puff++) {
      this.puffs.push({
        angle: (puff / 9) * Math.PI * 2 + Math.random() * 0.5,
        distance: 0.25 + Math.random() * 0.6,
        size: 0.5 + Math.random() * 0.5,
        drift: 0.6 + Math.random() * 0.8,
      });
    }
  }

  private get totalMs(): number {
    return SMOKE_GROW_MS + SMOKE_HOLD_MS + SMOKE_FADE_MS;
  }

  update(): void {
    this.ageMs += deltaTime;
    if (this.ageMs >= this.totalMs) this.toRemove = true;
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = this.radius * 1.8;
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
    const growing = snapOut(clamp01(this.ageMs / SMOKE_GROW_MS));
    const fading = clamp01((this.ageMs - SMOKE_GROW_MS - SMOKE_HOLD_MS) / SMOKE_FADE_MS);
    const alpha = 1 - fading;
    // It keeps expanding as it thins, the way smoke does — a cloud that held
    // its size and only dimmed would read as a fading decal.
    const spread = this.radius * growing * (1 + fading * 0.5);

    push();
    noStroke();
    for (const puff of this.puffs) {
      const rise = puff.drift * fading * this.radius * 0.4;
      const x = centre.x + Math.cos(puff.angle) * spread * puff.distance;
      const y = centre.y + Math.sin(puff.angle) * spread * puff.distance - rise;
      const size = this.radius * puff.size * (0.7 + growing * 0.6) * (1 + fading * 0.35);
      fill(214, 214, 208, 165 * alpha);
      circle(x, y, size);
      fill(238, 238, 232, 120 * alpha);
      circle(x - size * 0.12, y - size * 0.12, size * 0.62);
    }
    // A dense core, so the middle actually hides a body rather than showing
    // one through a ring of donuts.
    fill(226, 226, 220, 185 * alpha);
    circle(centre.x, centre.y, spread * 1.15);
    pop();
  }
}
