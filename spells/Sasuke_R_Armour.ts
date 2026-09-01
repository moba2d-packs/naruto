import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { clamp01, snapOut } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;

export const ARMOUR_REACH = 86;
export const ARMOUR_RISE_MS = 380;

/**
 * The Susanoo itself — a spectral ribcage standing around him.
 *
 * ## It has to say two things at once
 *
 * That he is in the form, and **how much of it is left**. The second is what
 * makes the ability readable from the other side: an enemy deciding whether
 * to commit needs to see the shell failing, and a bar over his head is not
 * where they are looking. So the ribs thin and gap as the pool drains — at
 * full it is a solid cage, at a sliver it is four faint arcs.
 *
 * ## Why ribs and not a bubble
 *
 * A shield in this engine is already drawn as a segment on the health bar,
 * and a translucent dome over a champion is what every other game's shield
 * looks like. The ribcage is the thing people recognise from the source, it
 * is unmistakably *this champion*, and it degrades legibly — a dome can only
 * fade, but a cage can lose ribs.
 */
export class SusanooArmour extends api.SpellObject {
  /** 0..1, written by the spell from the live shield pool. */
  integrity = 1;

  private ageMs = 0;

  update(): void {
    if (this.dropIfAttachmentLost()) return;
    const anchor = this._anchorUnit as AttackableUnit | null;
    if (anchor) this.position.set(anchor.position.x, anchor.position.y);
    this.ageMs += deltaTime;
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = ARMOUR_REACH + 24;
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
    const risen = snapOut(clamp01(this.ageMs / ARMOUR_RISE_MS));
    const left = clamp01(this.integrity);
    const reach = ARMOUR_REACH * risen;
    const sway = Math.sin(this.ageMs / 480) * 0.05;

    push();
    noStroke();
    // The body of the thing, which thins as the pool does.
    fill(120, 70, 210, 46 * left + 10);
    circle(body.x, body.y, reach * 2);
    fill(160, 110, 245, 30 * left);
    circle(body.x, body.y, reach * 1.45);

    // Ribs. Count falls with integrity, so the cage visibly comes apart
    // rather than merely dimming — the whole reason it is a cage.
    const ribs = Math.max(2, Math.round(6 * left));
    noFill();
    for (let rib = 0; rib < ribs; rib++) {
      const t = ribs === 1 ? 0.5 : rib / (ribs - 1);
      const lift = (t - 0.5) * reach * 1.2;
      const width = reach * 1.7 * Math.sqrt(Math.max(0.05, 1 - Math.pow((t - 0.5) * 2, 2)));
      stroke(205, 170, 255, 150 + 90 * left);
      strokeWeight(3.5);
      arc(body.x, body.y + lift, width, reach * 0.55, Math.PI + sway, Math.PI * 2 + sway);
    }

    // The outer shell, last to go, and the line an enemy measures against.
    stroke(225, 200, 255, 120 + 110 * left);
    strokeWeight(2.5);
    circle(body.x, body.y, reach * 2);
    pop();
  }
}
