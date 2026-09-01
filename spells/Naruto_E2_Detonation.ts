import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { clamp01, snapOut } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;
const Circle = api.utils.Quadtree.Circle;

export const BOOM_GROW_MS = 200;
export const BOOM_HOLD_MS = 260;
export const BOOM_FADE_MS = 700;
export const BOOM_RADIUS = 190;
export const BOOM_DAMAGE = 30;

/**
 * Where a Bijuudama stops: it does not simply run out of range, it lands.
 *
 * ## Why the shot needed an ending at all
 *
 * The sphere pierced everything on the line and then blinked out at maximum
 * range, which made the heaviest ability in the pack finish on nothing. A
 * player firing it down an empty lane got no answer to "where did that go",
 * and one firing it into a fight had no idea how far past the last victim it
 * had travelled.
 *
 * So the flight ends in a detonation with its own three phases, and the
 * detonation carries real damage. That is the second reason it exists: the
 * ability now rewards *placing* the far end of the line rather than only
 * lining bodies up along it.
 *
 * The blast deliberately spares whoever the sphere already pierced — being
 * hit by the shot and then by the crater it makes is one ability charging
 * twice for one dodge, and the tooltip does not say that.
 */
export class Naruto_E2_Detonation extends api.SpellObject {
  radius = BOOM_RADIUS;
  damage = BOOM_DAMAGE;
  /** Units the sphere already caught on the way here. */
  spare: AttackableUnit[] = [];

  private ageMs = 0;
  private bitten = false;
  private shards: { angle: number; length: number }[] = [];
  private burst = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(190, 140, 255, 0.9)',
    0.3
  );

  onAdded(): void {
    this.useParticles(this.burst);
    for (let shard = 0; shard < 10; shard++) {
      this.shards.push({
        angle: (shard / 10) * Math.PI * 2 + Math.random() * 0.4,
        length: 0.7 + Math.random() * 0.5,
      });
    }
  }

  private get totalMs(): number {
    return BOOM_GROW_MS + BOOM_HOLD_MS + BOOM_FADE_MS;
  }

  update(): void {
    this.ageMs += deltaTime;
    // Damage lands when the sphere has finished expanding, not on spawn: an
    // area that hurts before it has drawn itself is an area nobody could have
    // read.
    if (!this.bitten && this.ageMs >= BOOM_GROW_MS) {
      this.bitten = true;
      this.bite();
    }
    if (this.ageMs >= this.totalMs) this.toRemove = true;
  }

  private bite(): void {
    const caught = this.game.objectManager.queryObjects({
      area: new Circle({ x: this.position.x, y: this.position.y, r: this.radius }),
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];

    for (const unit of caught) {
      if (this.spare.includes(unit)) continue;
      unit.takeDamage(this.damage, this.owner);
      for (let grain = 0; grain < 8; grain++) {
        const angle = Math.random() * Math.PI * 2;
        this.burst.addParticle({
          x: unit.position.x + Math.cos(angle) * 16,
          y: unit.position.y + Math.sin(angle) * 16,
          r: 9 + Math.random() * 6,
        });
      }
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

  draw(): void {
    const centre = this.position;
    const growing = snapOut(clamp01(this.ageMs / BOOM_GROW_MS));
    const fading = clamp01((this.ageMs - BOOM_GROW_MS - BOOM_HOLD_MS) / BOOM_FADE_MS);
    const alpha = 1 - fading;
    const span = this.radius * 2 * growing;

    push();
    noStroke();
    fill(70, 26, 120, 95 * alpha * alpha);
    circle(centre.x, centre.y, span);
    fill(150, 90, 235, 70 * alpha * alpha);
    circle(centre.x, centre.y, span * 0.55);

    // Shards thrown outward and slowing — the blast is *dispersing*, which is
    // the one thing a dimming circle cannot say.
    stroke(205, 165, 255, 200 * alpha);
    strokeWeight(3 * alpha + 0.5);
    for (const shard of this.shards) {
      const inner = span * 0.4 * growing;
      const outer = inner + span * 0.34 * shard.length * (0.6 + fading * 0.7);
      const cos = Math.cos(shard.angle);
      const sin = Math.sin(shard.angle);
      line(
        centre.x + cos * inner,
        centre.y + sin * inner,
        centre.x + cos * outer,
        centre.y + sin * outer
      );
    }

    // Rim on the real damage radius, last to go.
    noFill();
    stroke(220, 185, 255, 230 * alpha);
    strokeWeight(2.5);
    circle(centre.x, centre.y, this.radius * 2 * growing);
    pop();
  }
}
