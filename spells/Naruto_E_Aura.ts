import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { clamp01, snapOut } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;

export const SAGE_REACH = 44;
export const SAGE_SETTLE_MS = 420;

/**
 * The mark of Sage Mode: pigment around the eyes and the natural energy
 * standing still around him.
 *
 * ## Why the quiet one still needs a tell
 *
 * Sennin Mōdo was the last ability in the kit with **nothing in the world** —
 * nine seconds of extra attack speed, reach and movement that an enemy simply
 * experienced without ever being given a cause. Same complaint the ultimate
 * earned, one size down: an effect nobody can see is a spike with no reason
 * on screen.
 *
 * ## Why it looks nothing like Kurama Mode
 *
 * Both are self-buffs on the same champion, so if they shared a motif the
 * player would learn neither. The cloak is *motion* — licking flames, a hot
 * orange, constant movement. This is **stillness**: a steady ring, two
 * unmoving marks, a cool amber. Sage chakra is gathered by not moving, and
 * the picture says so. `docs/VFX_STANDARD.md`'s first rule is that two
 * effects on one roster must not share geometry; two effects on one champion
 * matter more, not less.
 */
export class SageAura extends api.SpellObject {
  private ageMs = 0;

  update(): void {
    if (this.dropIfAttachmentLost()) return;
    const anchor = this._anchorUnit as AttackableUnit | null;
    if (anchor) this.position.set(anchor.position.x, anchor.position.y);
    this.ageMs += deltaTime;
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = SAGE_REACH + 16;
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
    // It settles into place rather than snapping on: the anticipation phase,
    // and the only movement in the whole effect.
    const settled = snapOut(clamp01(this.ageMs / SAGE_SETTLE_MS));
    const reach = SAGE_REACH * settled;
    // A slow breath, not a pulse. Fast movement here would read as the cloak.
    const breath = 1 + Math.sin(this.ageMs / 620) * 0.035;

    push();
    noStroke();
    fill(214, 158, 42, 34);
    circle(body.x, body.y, reach * 2.15 * breath);

    // One steady ring on the ground. Thin, because the standard is explicit
    // that a worn state is a stroke and never a fill — the body has to stay
    // visible through it.
    noFill();
    stroke(236, 196, 96, 150 * settled);
    strokeWeight(2);
    circle(body.x, body.y, reach * 2 * breath);

    // The two pigment marks. Placed rather than scattered, because the thing
    // a player is being asked to recognise is a *face*, and a ring of
    // particles is what every other buff in every game already looks like.
    noStroke();
    fill(226, 132, 46, 210 * settled);
    const lift = reach * 0.34;
    const spread = reach * 0.36;
    ellipse(body.x - spread, body.y - lift, reach * 0.34, reach * 0.19);
    ellipse(body.x + spread, body.y - lift, reach * 0.34, reach * 0.19);
    pop();
  }
}
