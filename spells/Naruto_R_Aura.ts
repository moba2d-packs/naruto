import type { AttackableUnit } from '@moba2d/core/content/types';
import type { Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { clamp01, snapOut } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;

/** How far the cloak reaches past the body. Read by the bounding box too. */
export const AURA_REACH = 62;

/**
 * The chakra cloak Naruto wears in Kurama Mode.
 *
 * ## Why this exists at all
 *
 * A transformed champion that looks exactly like an untransformed one is a
 * fifteen-second window the enemy cannot see. They have no reason to back off
 * and no way to know when it ends, so the ultimate reads to them as "Naruto
 * suddenly did more damage" — a spike with no cause on screen. The avatar swap
 * (`Naruto_R`) answers this on the scoreboard and the portrait; this answers it
 * *in the world*, which is where the fight is being read.
 *
 * ## Why it is a `SpellObject` and not drawn from the buff
 *
 * `Champion.draw()` is skipped when the caster is culled or fogged, so an
 * effect hung off the body stops existing for exactly the viewer who most
 * needs it. Anything that reaches past the caster's own body has to be its own
 * object — core's `docs/VFX_STANDARD.md` says so in its last paragraph, and
 * this reaches 62 units past him.
 *
 * It rides the body with `attachTo(unit, buff)`, so it dies with the form, and
 * with him, without either having to remember to kill it.
 */
export class KuramaAura extends api.SpellObject {
  /** Seeded once. `random()` in `draw` flickers instead of animating. */
  private flames: { angle: number; length: number; wobble: number }[] = [];
  private ageMs = 0;

  onAdded(): void {
    for (let flame = 0; flame < 11; flame++) {
      this.flames.push({
        angle: (flame / 11) * Math.PI * 2,
        length: 0.7 + Math.random() * 0.5,
        wobble: Math.random() * Math.PI * 2,
      });
    }
  }

  update(): void {
    // Attached effects must open with this or they keep drawing on the corpse
    // and reappear at the spawn point.
    if (this.dropIfAttachmentLost()) return;
    const anchor = this._anchorUnit as AttackableUnit | null;
    if (anchor) this.position.set(anchor.position.x, anchor.position.y);
    this.ageMs += deltaTime;
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = AURA_REACH + 20;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  draw(): void {
    const body = this.position;
    // A short grow-in rather than a pop: the standard's second rule, and it is
    // also what makes the transform read as an event rather than a state that
    // was always there.
    const entry = snapOut(clamp01(this.ageMs / 260));
    const pulse = 1 + Math.sin(this.ageMs / 210) * 0.07;
    const reach = AURA_REACH * entry * pulse;

    push();
    noStroke();
    // Ground glow, so the cloak reads against grass and stone alike.
    fill(255, 150, 40, 40);
    circle(body.x, body.y, reach * 2.1);
    fill(255, 190, 70, 55);
    circle(body.x, body.y, reach * 1.45);

    // The licks of chakra. Each is a tapering triangle rather than a line:
    // a flame has a direction and a width, and a ring of equal lines reads as
    // a gear rather than fire.
    for (const flame of this.flames) {
      const sway = Math.sin(this.ageMs / 160 + flame.wobble) * 0.22;
      const angle = flame.angle + sway;
      const tip = reach * flame.length * (1.05 + Math.sin(this.ageMs / 130 + flame.wobble) * 0.16);
      const spread = 0.24;
      fill(255, 170, 55, 190);
      triangle(
        body.x + Math.cos(angle) * tip,
        body.y + Math.sin(angle) * tip,
        body.x + Math.cos(angle - spread) * tip * 0.32,
        body.y + Math.sin(angle - spread) * tip * 0.32,
        body.x + Math.cos(angle + spread) * tip * 0.32,
        body.y + Math.sin(angle + spread) * tip * 0.32
      );
    }

    // The seal ring at his feet — one thin stroke, the anticipation layer the
    // standard asks a worn state to be, never a fill that hides the body.
    noFill();
    stroke(255, 225, 150, 200);
    strokeWeight(2.5);
    circle(body.x, body.y, reach * 1.15);
    pop();
  }
}
