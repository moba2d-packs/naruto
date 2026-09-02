import type { Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { SIGHT } from '../spellVfx';
import { clamp01, snapOut } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;

export const BOLT_GROW_MS = 90;
export const BOLT_HOLD_MS = 120;
export const BOLT_FADE_MS = 320;

/**
 * The discharge where Chidori lands.
 *
 * ## Why the ability needed an object at all
 *
 * It had none. The whole visual was the `Dash`'s own trail, which meant the
 * moment the ability actually *did* something — the hit, the stun, the stop —
 * had no picture of its own at all. Reported alongside the balance as
 * "hiệu ứng cũng còn đơn giản quá": a champion whose signature move is a
 * lightning strike was rendering a coloured smear.
 *
 * Branching bolts rather than a ring, because a ring is what every other
 * blast in this pack already is (Rasengan's vortex, Bijuudama's crater,
 * Gōkakyū's fire) and the standard's first rule is that two effects must not
 * share geometry. Lightning forks; nothing else here does.
 */
export class Sasuke_Q_Bolt extends api.SpellObject {
  /**
   * Chidori arriving: half a second, which is exactly enough to read where he just landed.
   *
   * `FogOfWar` reads `visionRadius` off any object and casts the same
   * wall-aware polygon it casts for a champion, so this one number is the
   * whole feature — and the effect's own lifetime is the window. See
   * `SIGHT` in `spellVfx.ts` for why the bands differ.
   */
  visionRadius = SIGHT.IMPACT;

  radius = 120;

  private ageMs = 0;
  /** Seeded once, in `onAdded` — a fork re-rolled per frame is a strobe. */
  private forks: { angle: number; kinks: number[]; reach: number }[] = [];

  onAdded(): void {
    for (let fork = 0; fork < 7; fork++) {
      const kinks: number[] = [];
      for (let kink = 0; kink < 4; kink++) kinks.push((Math.random() - 0.5) * 0.55);
      this.forks.push({
        angle: (fork / 7) * Math.PI * 2 + Math.random() * 0.4,
        kinks,
        reach: 0.65 + Math.random() * 0.45,
      });
    }
  }

  private get totalMs(): number {
    return BOLT_GROW_MS + BOLT_HOLD_MS + BOLT_FADE_MS;
  }

  update(): void {
    this.ageMs += deltaTime;
    if (this.ageMs >= this.totalMs) this.toRemove = true;
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
    const hit = this.position;
    const growing = snapOut(clamp01(this.ageMs / BOLT_GROW_MS));
    const fading = clamp01((this.ageMs - BOLT_GROW_MS - BOLT_HOLD_MS) / BOLT_FADE_MS);
    const alpha = 1 - fading;

    push();
    noStroke();
    fill(150, 200, 255, 70 * alpha * alpha);
    circle(hit.x, hit.y, this.radius * 2 * growing);

    // Each fork is a jointed line walking outward, drawn twice: a wide dim
    // pass for the glow and a thin bright one for the arc itself. One stroke
    // reads as a scratch.
    for (const pass of [
      { weight: 7, colour: [110, 180, 255], fade: 120 },
      { weight: 2.5, colour: [235, 248, 255], fade: 240 },
    ]) {
      stroke(pass.colour[0], pass.colour[1], pass.colour[2], pass.fade * alpha);
      strokeWeight(pass.weight);
      noFill();
      for (const fork of this.forks) {
        let angle = fork.angle;
        let x = hit.x;
        let y = hit.y;
        const step = (this.radius * growing * fork.reach) / fork.kinks.length;
        beginShape();
        vertex(x, y);
        for (const kink of fork.kinks) {
          angle += kink;
          x += Math.cos(angle) * step;
          y += Math.sin(angle) * step;
          vertex(x, y);
        }
        endShape();
      }
    }

    // The rim on the real shock radius, last to go.
    stroke(200, 230, 255, 200 * alpha);
    strokeWeight(2);
    circle(hit.x, hit.y, this.radius * 2 * growing);
    pop();
  }
}
