import type { Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { RASENGAN_BLUE, clamp01, type ChargePalette } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;

/** Where the sphere forms, relative to him: off his right hand, not on him. */
export const CHARGE_OFFSET = 46;

/**
 * The Rasengan while it is still being formed — the *anticipation* phase.
 *
 * ## Why the enemy has to see this
 *
 * A charged burst with no growing tell is a burst with no counterplay: the
 * damage simply becomes larger for reasons nobody watching could have read.
 * So the sphere forms in the world, beside his hand, and it visibly grows —
 * anyone can see how long he has been holding it and decide whether to walk
 * away. `docs/VFX_STANDARD.md`'s phases section states the rule; this is the
 * half of the ability that obeys it.
 *
 * ## Why the motes travel inward
 *
 * Chakra is being *gathered*. The standard is explicit that motion has to
 * agree with the effect — outward-flying particles over an inward gather
 * would be telling the player the opposite of what the ability is doing. Each
 * mote is seeded once at a distance and walks in; when it arrives it is
 * re-seeded outward rather than deleted, so the stream is continuous without
 * allocating every frame.
 */
export class Naruto_Q_Charge extends api.SpellObject {
  /** 0..1, written by the spell every frame from the runtime's own ratio. */
  ratio = 0;
  /** The sphere's radius at full charge — the missile inherits it. */
  maxRadius = 30;
  /**
   * What is being ground into shape, in colour.
   *
   * Defaults to the Rasengan's blue because this class was written for it —
   * and every *other* ability that reuses the orb has to say so, or it charges
   * one colour and throws another. That is what happened: the form's Q and E
   * both borrowed this orb and both threw something that was not blue.
   */
  palette: ChargePalette = RASENGAN_BLUE;

  /**
   * Where the caster is aiming, written by the spell every frame.
   *
   * This used to be read here, off `game.worldMouse`, and that was wrong on a
   * phone: while a spell is charging the finger is pressing its *button*, so
   * the orb swung round to the bottom corner of the screen instead of sitting
   * at the hand he is aiming with. `Spell.aimPoint` is the only thing that
   * knows the difference between a cursor and a thumb drag — so the spell
   * pushes the answer down here rather than the orb going looking for it.
   */
  aim: { x: number; y: number } | null = null;

  private ageMs = 0;
  private motes: { angle: number; distance: number; speed: number }[] = [];

  onAdded(): void {
    for (let mote = 0; mote < 14; mote++) {
      this.motes.push({
        angle: Math.random() * Math.PI * 2,
        distance: 0.4 + Math.random() * 0.6,
        speed: 0.011 + Math.random() * 0.014,
      });
    }
  }

  /** The point the sphere sits at: beside him, on the side he is aiming. */
  private anchor(): { x: number; y: number } {
    const aim = this.aim;
    const dx = (aim?.x ?? this.owner.position.x + 1) - this.owner.position.x;
    const dy = (aim?.y ?? this.owner.position.y) - this.owner.position.y;
    const length = Math.hypot(dx, dy) || 1;
    // Rotated a quarter turn off the aim, so the sphere sits at his hand
    // rather than floating between him and his target where it would cover
    // the very thing he is aiming at.
    return {
      x: this.owner.position.x + (-dy / length) * CHARGE_OFFSET,
      y: this.owner.position.y + (dx / length) * CHARGE_OFFSET,
    };
  }

  update(): void {
    this.ageMs += deltaTime;
    const spot = this.anchor();
    this.position.set(spot.x, spot.y);

    for (const mote of this.motes) {
      mote.distance -= mote.speed;
      // Re-seeded outward rather than removed: the gather has to look
      // continuous, and an array that never changes length never allocates.
      if (mote.distance <= 0.12) {
        mote.distance = 0.75 + Math.random() * 0.5;
        mote.angle = Math.random() * Math.PI * 2;
      }
    }
  }

  getDisplayBoundingBox(): Rectangle {
    // The motes start well outside the sphere, so the box is the gather's
    // reach and not the sphere's.
    const reach = this.maxRadius * 3.2;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  draw(): void {
    const orb = this.position;
    const charged = clamp01(this.ratio);
    // Never zero: a sphere that starts at nothing is a sphere nobody sees
    // form. It starts small and readable and grows to full.
    const radius = this.maxRadius * (0.34 + 0.66 * charged);
    const spin = this.ageMs / 70;

    push();

    // The motes, drawn first so the sphere sits on top of the stream feeding
    // it. Each is a short line pointing inward — direction, not just position.
    stroke(...this.palette.mote, 150 + 80 * charged);
    strokeWeight(2);
    for (const mote of this.motes) {
      const far = radius + this.maxRadius * 2.1 * mote.distance;
      const near = far - 11;
      const cos = Math.cos(mote.angle);
      const sin = Math.sin(mote.angle);
      line(orb.x + cos * far, orb.y + sin * far, orb.x + cos * near, orb.y + sin * near);
    }

    noStroke();
    fill(...this.palette.glow, 60 + 50 * charged);
    circle(orb.x, orb.y, radius * 2.5);
    fill(...this.palette.body, 200);
    circle(orb.x, orb.y, radius * 2);
    fill(...this.palette.core, 235);
    circle(orb.x, orb.y, radius * 0.85);

    // Counter-turning shells: it is being ground into shape, not floating.
    noFill();
    stroke(...this.palette.core, 230);
    strokeWeight(2.5);
    arc(orb.x, orb.y, radius * 1.7, radius * 1.7, spin, spin + 2.3);
    arc(orb.x, orb.y, radius * 1.15, radius * 1.15, -spin * 1.5, -spin * 1.5 + 1.9);

    // A ring that closes as the charge fills: the one number the enemy needs.
    stroke(255, 240, 190, 90 + 130 * charged);
    strokeWeight(3);
    arc(
      orb.x,
      orb.y,
      radius * 3,
      radius * 3,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * charged
    );
    pop();
  }
}
