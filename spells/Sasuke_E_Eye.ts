import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { clamp01, snapOut } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;

export const EYE_REACH = 40;
export const EYE_OPEN_MS = 260;

/**
 * The Sharingan, worn where an enemy can see it.
 *
 * ## Why it looks nothing like Naruto's two
 *
 * Three self-buffs now exist across two champions in this pack, and if any of
 * them shared a motif the player would learn none of them. So each one owns a
 * different *kind* of movement, which is a stronger separator than colour:
 *
 *   Kurama Mode  — licking flame, constant, hot orange   (motion)
 *   Sennin Mōdo  — a still ring and two toad marks, amber (stillness)
 *   Sharingan    — one turning wheel, crimson             (rotation)
 *
 * Nothing else in either kit rotates on the body, so a spinning red disc is
 * unambiguous at a glance even at minimum zoom.
 *
 * ## Why the tomoe, and why three
 *
 * It is the single most recognisable shape in the source material, and it
 * survives being small in a way an eye shape does not: three commas around a
 * ring still read as three commas at fifteen pixels, while an iris and a
 * pupil collapse into a dot.
 */
export class SharinganEye extends api.SpellObject {
  private ageMs = 0;

  update(): void {
    if (this.dropIfAttachmentLost()) return;
    const anchor = this._anchorUnit as AttackableUnit | null;
    if (anchor) this.position.set(anchor.position.x, anchor.position.y);
    this.ageMs += deltaTime;
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = EYE_REACH + 16;
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
    const opened = snapOut(clamp01(this.ageMs / EYE_OPEN_MS));
    const reach = EYE_REACH * opened;
    const spin = this.ageMs / 520;

    push();
    noStroke();
    // A dark plate under everything. Against Sasuke's own portrait — which is
    // dark blue and black — crimson alone would sink, the same way Naruto's
    // amber marks sank into his orange coat.
    fill(26, 8, 12, 150);
    circle(body.x, body.y, reach * 2.05);
    fill(178, 26, 32, 92);
    circle(body.x, body.y, reach * 1.85);

    noFill();
    stroke(255, 96, 96, 210);
    strokeWeight(2.5);
    circle(body.x, body.y, reach * 1.9);

    // Three tomoe on a slow wheel. Each is a disc with a tail curling the way
    // the wheel turns, so the rotation is legible from the shapes themselves
    // and not only from watching them move.
    noStroke();
    for (let mark = 0; mark < 3; mark++) {
      const angle = spin + (mark / 3) * Math.PI * 2;
      const orbit = reach * 0.62;
      const cx = body.x + Math.cos(angle) * orbit;
      const cy = body.y + Math.sin(angle) * orbit;
      const size = reach * 0.3;

      fill(18, 6, 8, 230);
      circle(cx, cy, size * 1.35);
      // The tail, swept behind the head of the comma.
      const tail = angle + Math.PI * 0.62;
      triangle(
        cx + Math.cos(tail) * size * 1.5,
        cy + Math.sin(tail) * size * 1.5,
        cx + Math.cos(tail - 1.4) * size * 0.6,
        cy + Math.sin(tail - 1.4) * size * 0.6,
        cx + Math.cos(tail + 1.4) * size * 0.6,
        cy + Math.sin(tail + 1.4) * size * 0.6
      );
      fill(255, 78, 78, 235);
      circle(cx, cy, size * 0.72);
    }
    pop();
  }
}
