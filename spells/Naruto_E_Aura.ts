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
    rectMode(CORNER);

    // Ground glow first, under everything — a wash the marks can sit on.
    noStroke();
    fill(206, 138, 30, 40);
    circle(body.x, body.y, reach * 2.2 * breath);

    // A ring with a dark rim under a bright line. `docs/VFX_STANDARD.md` is
    // explicit that colour alone is not enough — a dark rim under a light
    // shape is what makes a silhouette hold, and here it is holding against
    // an orange portrait, which is the exact case that failed: amber marks on
    // an amber body were reported as invisible.
    noFill();
    stroke(46, 26, 8, 190 * settled);
    strokeWeight(5.5);
    circle(body.x, body.y, reach * 2 * breath);
    stroke(255, 214, 120, 235 * settled);
    strokeWeight(2.5);
    circle(body.x, body.y, reach * 2 * breath);

    /**
     * The toad eyes, and they sit **above** the body rather than on it.
     *
     * Painting a face onto a top-down sprite is fighting the medium: there is
     * no facing to put eyes on, and whatever is painted lands on the busiest,
     * most colour-matched part of the picture. Held clear of the silhouette
     * they are always on plain ground, always the same size, and always the
     * same two shapes.
     *
     * Sized past the 40-unit floor the standard sets for anything a player
     * has to *find*. The first cut drew them at roughly fifteen, which is
     * grit.
     */
    const eyeLift = reach * 1.05;
    const eyeSpread = reach * 0.62;
    const eyeW = reach * 0.62;
    const eyeH = reach * 0.42;
    for (const side of [-1, 1]) {
      const ex = body.x + side * eyeSpread;
      const ey = body.y - eyeLift;
      // Dark backing plate, drawn wider than the eye, so the whole mark reads
      // as one object over grass, stone or an orange coat alike.
      noStroke();
      fill(38, 20, 6, 215 * settled);
      ellipse(ex, ey, eyeW * 1.32, eyeH * 1.34);
      // The sclera: warm and bright, the focal value of the whole effect.
      fill(255, 196, 84, 245 * settled);
      ellipse(ex, ey, eyeW, eyeH);
      // A toad's pupil is a horizontal bar, and that bar is the single most
      // recognisable thing about Sage Mode. Black, so it holds at any zoom.
      fill(24, 14, 6, 245 * settled);
      rect(ex - eyeW * 0.42, ey - eyeH * 0.13, eyeW * 0.84, eyeH * 0.26, eyeH * 0.1);
    }
    pop();
  }
}
