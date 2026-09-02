import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { SIGHT } from '../spellVfx';
import { clamp01, snapOut } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;
const Circle = api.utils.Quadtree.Circle;

export const BLAZE_GROW_MS = 200;
export const BLAZE_BURN_MS = 2_400;
export const BLAZE_FADE_MS = 700;
export const BLAZE_TICK_MS = 400;
export const BLAZE_TICK_DAMAGE = 10;

/**
 * The ground a Great Fireball leaves behind it.
 *
 * ## Why this is a `SpellObject` and not a map zone
 *
 * `TerrainZone` — the thing this pack added to core — is for ground a *map*
 * declares: a desert, a river, a grove. It carries no damage on purpose,
 * because a zone has no owner and a kill it caused would have nobody to
 * credit. Burning ground an ability laid down is the opposite case: it has an
 * owner, so the bounty, the assist window and the death recap all work by
 * simply passing `this.owner` along.
 *
 * ## The tick is a real clock, not a frame counter
 *
 * Damage every 500ms regardless of frame rate. A per-frame burn is sixty
 * times the tooltip on a good machine and a fifth of it on a bad one, which
 * is the kind of bug that only shows up on somebody else's phone.
 */
export class Sasuke_W_Blaze extends api.SpellObject {
  /**
   * The fire stays on the ground, so it holds the sight there for as long as it burns.
   *
   * `FogOfWar` reads `visionRadius` off any object and casts the same
   * wall-aware polygon it casts for a champion, so this one number is the
   * whole feature — and the effect's own lifetime is the window. See
   * `SIGHT` in `spellVfx.ts` for why the bands differ.
   */
  visionRadius = SIGHT.ZONE;

  radius = 150;

  private ageMs = 0;
  private sinceTickMs = 0;
  private flames: { angle: number; distance: number; height: number; phase: number }[] = [];

  onAdded(): void {
    for (let flame = 0; flame < 12; flame++) {
      this.flames.push({
        angle: Math.random() * Math.PI * 2,
        distance: Math.sqrt(Math.random()),
        height: 0.6 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  private get totalMs(): number {
    return BLAZE_GROW_MS + BLAZE_BURN_MS + BLAZE_FADE_MS;
  }

  update(): void {
    this.ageMs += deltaTime;

    // It only burns once it has finished spreading, and stops the moment it
    // starts dying down — ground that is visibly going out must not still be
    // hurting people.
    const burning = this.ageMs >= BLAZE_GROW_MS && this.ageMs < BLAZE_GROW_MS + BLAZE_BURN_MS;
    if (burning) {
      this.sinceTickMs += deltaTime;
      while (this.sinceTickMs >= BLAZE_TICK_MS) {
        this.sinceTickMs -= BLAZE_TICK_MS;
        this.scorch();
      }
    }

    if (this.ageMs >= this.totalMs) this.toRemove = true;
  }

  private scorch(): void {
    const caught = this.game.objectManager.queryObjects({
      area: new Circle({ x: this.position.x, y: this.position.y, r: this.radius }),
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];
    for (const unit of caught) unit.takeDamage(BLAZE_TICK_DAMAGE, this.owner);
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = this.radius + 40;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  /** Ground art: under the feet standing in it, never over them. */
  zIndex = api.layers.GROUND_Z_INDEX;

  draw(): void {
    const centre = this.position;
    const growing = snapOut(clamp01(this.ageMs / BLAZE_GROW_MS));
    const fading = clamp01((this.ageMs - BLAZE_GROW_MS - BLAZE_BURN_MS) / BLAZE_FADE_MS);
    const alpha = 1 - fading;
    const span = this.radius * 2 * growing;

    push();
    noStroke();
    fill(120, 40, 12, 110 * alpha);
    circle(centre.x, centre.y, span);
    fill(200, 80, 20, 80 * alpha);
    circle(centre.x, centre.y, span * 0.68);

    // Tongues that rise and fall on their own phase. One shared wobble would
    // read as a single blinking decal rather than a fire.
    for (const flame of this.flames) {
      const lick = 0.6 + 0.4 * Math.sin(this.ageMs / 130 + flame.phase);
      const x = centre.x + Math.cos(flame.angle) * this.radius * growing * flame.distance;
      const y = centre.y + Math.sin(flame.angle) * this.radius * growing * flame.distance;
      const tall = this.radius * 0.34 * flame.height * lick * alpha;
      fill(255, 140, 40, 200 * alpha);
      triangle(x, y - tall, x - tall * 0.34, y + tall * 0.2, x + tall * 0.34, y + tall * 0.2);
      fill(255, 226, 150, 190 * alpha);
      triangle(
        x,
        y - tall * 0.55,
        x - tall * 0.16,
        y + tall * 0.14,
        x + tall * 0.16,
        y + tall * 0.14
      );
    }

    noFill();
    stroke(255, 130, 50, 200 * alpha);
    strokeWeight(2.5);
    circle(centre.x, centre.y, this.radius * 2 * growing);
    pop();
  }
}
