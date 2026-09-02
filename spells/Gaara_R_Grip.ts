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
  private jaws: { angle: number; length: number; lean: number }[] = [];

  private burst = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(206, 174, 116, 0.92)',
    0.45
  );

  onAdded(): void {
    for (let jaw = 0; jaw < 9; jaw++) {
      this.jaws.push({
        angle: (jaw / 9) * Math.PI * 2 + Math.random() * 0.3,
        length: 0.7 + Math.random() * 0.55,
        lean: (Math.random() - 0.5) * 0.4,
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

      for (const jaw of this.jaws) {
        // Motion agreeing with the effect: everything travels inward,
        // because the ability is closing on them.
        // Still buried while `risen` is low: the jaws come *up* through the
        // floor before they close, so there is no frame where they pop in.
        const reach = GRIP_RADIUS * (1.55 - 0.62 * closing) * jaw.length;
        const emerged = risen;
        const baseX = centre.x + Math.cos(jaw.angle) * reach;
        const baseY = centre.y + Math.sin(jaw.angle) * reach;
        const tipX = centre.x + Math.cos(jaw.angle + jaw.lean) * reach * 0.42;
        const tipY = centre.y + Math.sin(jaw.angle + jaw.lean) * reach * 0.42;
        const width = (8 + jaw.length * 5) * (0.4 + 0.6 * emerged);
        const nx = -Math.sin(jaw.angle) * width;
        const ny = Math.cos(jaw.angle) * width;

        fill(74, 52, 26, 225 * emerged);
        triangle(baseX - nx, baseY - ny, baseX + nx, baseY + ny, tipX, tipY);
        fill(206, 174, 116, 235 * emerged);
        triangle(
          baseX - nx * 0.55,
          baseY - ny * 0.55,
          baseX + nx * 0.55,
          baseY + ny * 0.55,
          tipX,
          tipY
        );
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

    for (const jaw of this.jaws) {
      // Falling, not flying out: the crush pulled inward, so the aftermath
      // settles rather than scattering.
      const drop = GRIP_RADIUS * 0.5 * (1 - shut) + falling * 16;
      fill(206, 174, 116, 230 * alpha);
      circle(
        centre.x + Math.cos(jaw.angle) * drop,
        centre.y + Math.sin(jaw.angle) * drop + falling * 12,
        7 + jaw.length * 5
      );
    }

    noFill();
    stroke(74, 52, 26, 220 * alpha);
    strokeWeight(3);
    circle(centre.x, centre.y, GRIP_RADIUS * 2 * (1 - 0.35 * shut));
    pop();
  }
}
