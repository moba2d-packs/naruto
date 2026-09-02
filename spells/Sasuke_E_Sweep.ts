import type { Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { clamp01, snapOut } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;

export const SWEEP_OUT_MS = 340;
export const SWEEP_HOLD_MS = 160;
export const SWEEP_FADE_MS = 320;

/**
 * How far the Sharingan just looked.
 *
 * ## The gap
 *
 * This ability's headline is a radius — *"lộ mọi tướng địch trong vùng rộng"*
 * — and it drew nothing at that radius. A spinning eye appeared on Sasuke's
 * body and enemies somewhere off screen quietly gained a buff icon. The one
 * number the whole ability is about, 760px of it, was invisible to the person
 * who pressed the button. Reported exactly that way.
 *
 * `docs/VFX_STANDARD.md`'s "the animation is the tooltip": nobody reads a
 * description mid-fight, so an ability whose effect is an *area* has to draw
 * the area or the player is guessing at it forever. Worse, they cannot learn
 * it — every cast teaches nothing, because every cast looks the same whether
 * it caught three champions or none.
 *
 * ## Where it stands, and why not on him
 *
 * At the point the query ran, not on Sasuke's body. `Sasuke_E` reveals
 * whatever was inside the circle **at cast time**, so a ring that followed him
 * would draw a promise the ability did not make — he walks 100px during the
 * sweep and the picture would say he had looked somewhere he had not.
 *
 * It is still `attachTo`'d to him, for the two things attachment is for: it
 * dies when he does, and it inherits his fog (`GameObject.visionAnchor`), so
 * a Sasuke hidden behind a wall does not announce himself with a 760px ring.
 */
export class Sasuke_E_Sweep extends api.SpellObject {
  /** The radius the query actually used. Never a second copy of it. */
  reach = 760;

  private ageMs = 0;

  private get totalMs(): number {
    return SWEEP_OUT_MS + SWEEP_HOLD_MS + SWEEP_FADE_MS;
  }

  update(): void {
    if (this.dropIfAttachmentLost()) return;
    this.ageMs += deltaTime;
    if (this.ageMs >= this.totalMs) this.toRemove = true;
  }

  getDisplayBoundingBox(): Rectangle {
    // The whole circle. A box around the centre point would cull the ring the
    // moment the camera held one edge of it and not the middle — which, at
    // this radius, is most of the time.
    const reach = this.reach * 1.1;
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
    const age = this.ageMs;

    // One normalized `t` per phase. The wave eases *out* — fast away from him
    // and settling at the edge — because that is what a look is: it arrives
    // where it is going and stops, rather than drifting to a halt.
    const out = snapOut(clamp01(age / SWEEP_OUT_MS));
    const fading = clamp01((age - SWEEP_OUT_MS - SWEEP_HOLD_MS) / SWEEP_FADE_MS);
    const alpha = 255 * (1 - fading) ** 1.6;

    push();
    noFill();

    // The boundary, held after the wave arrives. This is the line the player
    // is actually being told about, so it is the one that lingers.
    stroke(210, 50, 70, alpha * 0.55);
    strokeWeight(2.5);
    circle(at.x, at.y, this.reach * 2 * out);

    // The wave itself: a brighter, thicker edge riding just inside the
    // boundary, so the ring reads as having *travelled* rather than appeared.
    const wave = out * (1 - fading * 0.06);
    stroke(255, 130, 150, alpha * (1 - out * 0.45));
    strokeWeight(6 * (1 - out * 0.6));
    circle(at.x, at.y, this.reach * 2 * wave * 0.985);

    // Three tomoe riding the edge, so the circle is unmistakably this
    // ability's and not a generic targeting ring. The same three marks the
    // eye on his body is turning.
    noStroke();
    const spin = age / 260;
    for (let mark = 0; mark < 3; mark++) {
      const angle = spin + (mark / 3) * Math.PI * 2;
      const seat = this.reach * out;
      fill(235, 60, 85, alpha * 0.9);
      circle(at.x + Math.cos(angle) * seat, at.y + Math.sin(angle) * seat, 13 * (1 - fading));
    }
    pop();
  }
}
