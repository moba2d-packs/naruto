import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { SIGHT, clamp01, snapOut } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;
const Circle = api.utils.Quadtree.Circle;

export const SAND_RADIUS = 96;
export const SAND_LINGER_MS = 2_200;
export const SAND_FADE_MS = 600;
export const SAND_TICK_MS = 500;
export const SAND_TICK_DAMAGE = 8;
export const SAND_SLOW = 0.35;
/**
 * How many bites one patch actually lands.
 *
 * `ceil - 1`, not `floor`: the loop runs only while the sand is still biting,
 * so a tick falling on the last millisecond never fires. Derived rather than
 * written down because the arithmetic and the loop disagreed once already,
 * and the tooltip believed the arithmetic.
 */
export const SAND_BITES = Math.ceil(SAND_LINGER_MS / SAND_TICK_MS) - 1;
/** Everything one patch is worth to somebody who stands in all of it. */
export const SAND_TOTAL_DAMAGE = SAND_TICK_DAMAGE * SAND_BITES;

/**
 * The patch Suna Shigure leaves where its column fell.
 *
 * ## This is the ability, not the leftovers
 *
 * The column is 22 damage and a moment; the loose sand is two seconds of
 * ground nobody wants to stand on. That split is deliberate and it is what
 * makes Gaara a different champion from the two already here: Naruto and
 * Sasuke both ask "did you dodge it", and this asks "will you walk through
 * it", which is a question the enemy answers slowly and in the open.
 *
 * It is also the whole of his waveclear. One column does not remove a minion
 * — nothing in this pack's band does — so the clear comes from area and
 * repetition, exactly as `docs/VFX_STANDARD.md` says it must.
 *
 * ## The slow is renewed, never stacked
 *
 * `Slow`'s default add type stacks ten deep, so a zone re-applying its slow
 * every tick turns "35%" into a standstill within a second and a half.
 * `RENEW_EXISTING` rewinds the one slow's clock instead — the pattern this
 * pack's `AGENTS.md` writes out, because it has been got wrong before.
 *
 * The slow outlives a single tick on purpose: it is a little longer than the
 * gap between ticks, so walking *out* of the sand still costs a moment
 * rather than being free on the frame you cross the rim.
 */
export const SAND_SLOW_MS = SAND_TICK_MS + 400;

export class Gaara_Q_Sand extends api.SpellObject {
  /**
   * Loose sand holds the ground it is lying on.
   *
   * `FogOfWar` reads `visionRadius` off any object, so this one number is the
   * whole feature and the patch's own life is the window. `SIGHT.ZONE` rather
   * than `IMPACT` because a placed effect that stays is holding ground, which
   * is worth more than a hit that is already over — see `spellVfx.ts`.
   */
  visionRadius = SIGHT.ZONE;

  radius = SAND_RADIUS;

  private ageMs = 0;
  private sinceTickMs = 0;

  /**
   * Where each grain drifts, seeded once.
   *
   * `random()` inside `draw()` re-rolls every frame, which reads as static
   * rather than as sand — the standard calls this out by name.
   */
  private grains: { angle: number; distance: number; drift: number; phase: number }[] = [];

  onAdded(): void {
    for (let grain = 0; grain < 22; grain++) {
      this.grains.push({
        angle: Math.random() * Math.PI * 2,
        // Square-rooted so the grains spread evenly over the disc instead of
        // crowding the middle, which is what a raw uniform radius does.
        distance: Math.sqrt(Math.random()),
        drift: 0.4 + Math.random() * 0.8,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  private get totalMs(): number {
    return SAND_LINGER_MS + SAND_FADE_MS;
  }

  update(): void {
    this.ageMs += deltaTime;

    // It stops working the moment it starts visibly dying down. Ground that
    // is fading must not still be biting — the picture is the tooltip.
    if (this.ageMs < SAND_LINGER_MS) {
      this.sinceTickMs += deltaTime;
      // A real clock, not a frame counter: a per-frame tick is sixty times
      // the tooltip on a good machine and a fifth of it on a bad one.
      while (this.sinceTickMs >= SAND_TICK_MS) {
        this.sinceTickMs -= SAND_TICK_MS;
        this.bite();
      }
    }

    if (this.ageMs >= this.totalMs) this.toRemove = true;
  }

  private bite(): void {
    const caught = this.game.objectManager.queryObjects({
      area: new Circle({ x: this.position.x, y: this.position.y, r: this.radius }),
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];

    for (const unit of caught) {
      unit.takeDamage(SAND_TICK_DAMAGE, this.owner, 'MAGIC', 'Suna Shigure');
      const slow = new api.buffs.Slow(SAND_SLOW_MS, this.owner, unit);
      slow.percent = SAND_SLOW;
      slow.buffAddType = api.enums.BuffAddType.RENEW_EXISTING;
      slow.image = api.asset('spell_gaara_q');
      unit.addBuff(slow);
    }
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = this.radius + 30;
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
    const settling = snapOut(clamp01(this.ageMs / 180));
    const fading = clamp01((this.ageMs - SAND_LINGER_MS) / SAND_FADE_MS);
    const span = this.radius * 2 * settling;

    push();
    noStroke();

    // The fill dies first and the rim last. The outline is the thing that was
    // saying "this is the radius", so it is the last thing a player should
    // lose — `docs/VFX_STANDARD.md` is explicit about it.
    fill(150, 116, 66, 110 * (1 - fading));
    circle(centre.x, centre.y, span);
    fill(178, 142, 86, 90 * (1 - fading));
    circle(centre.x, centre.y, span * 0.62);

    for (const grain of this.grains) {
      const swirl = grain.angle + Math.sin(this.ageMs / 420 + grain.phase) * 0.5 * grain.drift;
      const reach = this.radius * settling * grain.distance;
      const x = centre.x + Math.cos(swirl) * reach;
      const y = centre.y + Math.sin(swirl) * reach;
      fill(206, 174, 116, 210 * (1 - fading));
      circle(x, y, 3.5 + grain.drift * 2.5);
    }

    noFill();
    // A dark rim under the pale sand, so the edge holds over grass, stone and
    // water alike rather than dissolving into whichever it happens to be on.
    stroke(74, 52, 26, 200 * (1 - fading * 0.6));
    strokeWeight(3);
    circle(centre.x, centre.y, this.radius * 2 * settling);
    pop();
  }
}
