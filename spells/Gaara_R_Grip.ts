import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { SIGHT, clamp01, impactBurst, snapOut, windIn } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;

export const GRIP_ROOT_MS = 1_400;
export const GRIP_TICK_MS = 400;
export const GRIP_TICK_DAMAGE = 8;
export const GRIP_CRUSH_DAMAGE = 24;
/** How long the sand hangs in the air after the crush, before it falls. */
export const GRIP_FALL_MS = 420;
export const GRIP_RADIUS = 62;
/**
 * How long the jaws take to come out of the ground.
 *
 * They used to be at full size on frame one, which is the other half of "ko
 * có transition": the wave vanished and the spikes were simply *there*. The
 * rise overlaps the wave's collapse, so the hand-off is one continuous
 * motion rather than two events.
 */
export const GRIP_RISE_MS = 200;

/**
 * The sand that has hold of somebody, and then closes.
 *
 * ## It rides the victim, not the ground
 *
 * `attachTo` the target rather than standing where the cast landed: the whole
 * ability is "that person, specifically", and sand that stayed behind while
 * the body it caught was displaced by somebody else's knock-up would be
 * drawing a lie. `dropIfAttachmentLost()` is what stops it drawing on a
 * corpse or reappearing at the spawn point.
 *
 * ## Its team is Gaara's, which is why it lights the victim up
 *
 * A `SpellObject` takes its team from the `owner` it was constructed with,
 * not from whatever it is attached to. So this one is Gaara's while sitting
 * on an enemy — and that is exactly what makes `visionRadius` reveal the
 * person carrying it. The mark is the point: an ultimate that pins somebody
 * for well over a second should let his team see what they are pinning.
 *
 * `SIGHT.MARK` and not `BLAST`, because this reveals *a body*, not a hole in
 * the dark — see the band in `spellVfx.ts`.
 */
export class Gaara_R_Grip extends api.SpellObject {
  visionRadius = SIGHT.MARK;

  private ageMs = 0;
  private sinceTickMs = 0;
  private crushed = false;
  /**
   * The ridges on each bank, rooted along its spine.
   *
   * `along` is the position down the bank, −1 to 1 — a *line*, not an angle
   * around a hub. The first cut spaced nine jaws evenly around the victim and
   * pointed each one inward, which renders as a gold starburst: the same
   * "rooted at a point and fanned out is a mace" failure as Kurama Arms and
   * as this ultimate's own wave. Found by `npm run e2e:vfx`, which is the
   * only thing that could have found it.
   */
  private ridges: { along: number; height: number; lean: number; width: number }[] = [];

  /**
   * The axis the jaws close along, written by the surge.
   *
   * Set to the direction the wave arrived from, so the grip continues the
   * motion that made it rather than snapping to a fixed world axis.
   */
  axis: { x: number; y: number } = { x: 1, y: 0 };

  private burst = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(206, 174, 116, 0.92)',
    0.45
  );

  onAdded(): void {
    for (let ridge = 0; ridge < 6; ridge++) {
      const along = -1 + (2 * (ridge + 0.5)) / 6;
      this.ridges.push({
        along,
        // Longest at the middle of the bank, so the two jaws meet nose-first
        // rather than closing as two flat plates.
        height: (0.55 + 0.45 * Math.cos(along * 1.1)) * (0.7 + Math.random() * 0.5),
        lean: (Math.random() - 0.5) * 0.25,
        width: 0.1 + Math.random() * 0.05,
      });
    }
    this.useParticles(this.burst);
  }

  update(): void {
    if (this.dropIfAttachmentLost()) return;
    const victim = this._anchorUnit as AttackableUnit | null;
    if (victim) this.position.set(victim.position.x, victim.position.y);

    this.ageMs += deltaTime;

    if (this.ageMs < GRIP_ROOT_MS) {
      this.sinceTickMs += deltaTime;
      // A real clock. A per-frame squeeze is sixty times the tooltip on a
      // good machine and a fifth of it on a bad one.
      while (this.sinceTickMs >= GRIP_TICK_MS) {
        this.sinceTickMs -= GRIP_TICK_MS;
        if (victim) victim.takeDamage(GRIP_TICK_DAMAGE, this.owner, 'MAGIC', 'Sabaku Sōsō');
      }
      return;
    }

    if (!this.crushed) this.crush(victim);
    // Never removed on the frame it deals its damage: the sand hangs, then
    // falls. The crush is the loudest moment in Gaara's kit and it would be
    // over before anybody read it.
    if (this.ageMs >= GRIP_ROOT_MS + GRIP_FALL_MS) this.toRemove = true;
  }

  /** Idempotent: death, a scene exit and the timer can converge on this. */
  private crush(victim: AttackableUnit | null): void {
    if (this.crushed) return;
    this.crushed = true;
    if (!victim) return;
    victim.takeDamage(GRIP_CRUSH_DAMAGE, this.owner, 'MAGIC', 'Sabaku Sōsō');
    impactBurst(this.burst, victim.position, 16, 30, 13);
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = GRIP_RADIUS + 46;
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
    const holding = clamp01(this.ageMs / GRIP_ROOT_MS);
    const falling = clamp01((this.ageMs - GRIP_ROOT_MS) / GRIP_FALL_MS);

    push();

    if (this.ageMs < GRIP_ROOT_MS) {
      // ANTICIPATION that never stops being anticipation: the jaws close over
      // the whole root, so the enemy team can read how long is left from the
      // picture rather than from a buff icon nobody is looking at.
      const closing = windIn(holding);
      // Rising out of the ground, overlapping the wave's collapse — the two
      // together are one motion, which is what "smooth" actually means here.
      const risen = snapOut(clamp01(this.ageMs / GRIP_RISE_MS));
      noStroke();
      fill(150, 116, 66, (120 + 70 * closing) * risen);
      circle(centre.x, centre.y, GRIP_RADIUS * 2 * (0.6 + 0.25 * closing) * (0.35 + 0.65 * risen));

      // Two banks, closing. Each one's ridges are rooted along its own spine
      // and all point at the other bank — which is what makes this read as a
      // grip instead of as a sun.
      const axis = Math.atan2(this.axis.y, this.axis.x);
      for (const side of [1, -1]) {
        const standoff = GRIP_RADIUS * (1.45 - 0.75 * closing);

        push();
        translate(centre.x, centre.y);
        rotate(axis);

        fill(122, 92, 46, 235 * risen);
        beginShape();
        for (let i = 0; i <= 10; i++) {
          const a = -1.05 + (i / 10) * 2.1;
          vertex(side * standoff * Math.cos(a * 0.55), Math.sin(a) * GRIP_RADIUS * 1.05);
        }
        for (let i = 10; i >= 0; i--) {
          const a = -1.05 + (i / 10) * 2.1;
          vertex(
            side * (standoff + GRIP_RADIUS * 0.42) * Math.cos(a * 0.55),
            Math.sin(a) * GRIP_RADIUS
          );
        }
        endShape(CLOSE);

        for (const ridge of this.ridges) {
          const a = ridge.along * 0.95;
          const rootX = side * standoff * Math.cos(a * 0.55);
          const rootY = Math.sin(a) * GRIP_RADIUS;
          const length = GRIP_RADIUS * 0.62 * ridge.height * (0.4 + 0.6 * closing) * risen;
          const width = GRIP_RADIUS * ridge.width;
          const tipX = rootX - side * length;
          const tipY = rootY + ridge.lean * length;

          // A dark rim under each ridge, not around the bank, or the teeth
          // merge into one slab at a glance.
          fill(61, 43, 18, 235 * risen);
          triangle(rootX, rootY - width, rootX, rootY + width, tipX, tipY);
          fill(214, 184, 128, 240 * risen);
          triangle(
            rootX,
            rootY - width * 0.55,
            rootX,
            rootY + width * 0.55,
            tipX + side * length * 0.15,
            tipY
          );
        }
        pop();
      }

      pop();
      return;
    }

    // CLIMAX and DISSIPATION: the sand snaps shut, then drops away.
    const shut = snapOut(clamp01(falling * 2.2));
    const alpha = 1 - falling;
    noStroke();
    fill(150, 116, 66, 200 * alpha);
    circle(centre.x, centre.y, GRIP_RADIUS * 2 * (1 - 0.35 * shut));

    for (const ridge of this.ridges) {
      // Falling, not flying out: the crush pulled inward, so the aftermath
      // settles rather than scattering.
      for (const side of [1, -1]) {
        const drop = GRIP_RADIUS * 0.42 * (1 - shut) + falling * 16;
        fill(206, 174, 116, 230 * alpha);
        circle(
          centre.x + side * drop * Math.cos(ridge.along * 0.5),
          centre.y + Math.sin(ridge.along) * drop + falling * 12,
          7 + ridge.height * 5
        );
      }
    }

    noFill();
    stroke(74, 52, 26, 220 * alpha);
    strokeWeight(3);
    circle(centre.x, centre.y, GRIP_RADIUS * 2 * (1 - 0.35 * shut));
    pop();
  }
}
