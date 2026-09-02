import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { SIGHT } from '../spellVfx';
import { Gaara_R_Grip } from './Gaara_R_Grip';

const QRectangle = api.utils.Quadtree.Rectangle;

export const SURGE_SPEED = 7.5;
export const SURGE_WIDTH = 74;

/** p5's `HALF_PI` only exists inside a running sketch. The value is not in doubt. */
const QUARTER_TURN = Math.PI / 2;

/**
 * The sand crossing the ground on its way to somebody.
 *
 * ## Why this object exists at all
 *
 * The first cut of Sabaku Sōsō was a `UNIT` lock-on: pick a body, and the
 * sand simply *was* on them. Reported, correctly, as "instant quá, ko có
 * animation gì bay từ Gaara tới kẻ địch, địch ko né đc, chiêu này quá OP" —
 * and every clause of that was true. A 1.8-second root plus the largest
 * damage total in the kit, on a ten-second cooldown, with no travel, no tell
 * and nothing to sidestep, is not an ultimate. It is a button that deletes
 * whoever the cursor was over.
 *
 * So the sand travels. It is slow on purpose — about a second and a half to
 * cross its full range — and it runs along the ground in a straight line, so
 * the counterplay is the ordinary one every other skillshot in this pack
 * asks for: move sideways.
 *
 * ## It takes the first person it reaches, and only them
 *
 * `maxHitCount = 1`. A wave that gripped everyone in the line would be a
 * team-wide root, which is a different and much stronger ability; and a wave
 * that passed *through* people to reach a chosen victim would be back to
 * having no counterplay for the person it was aimed at, while adding some
 * for everyone else. First body, and it stops there.
 */
export class Gaara_R_Surge extends api.MissileSpellObject {
  speed = SURGE_SPEED;
  size = SURGE_WIDTH;
  /** The wave itself hurts nobody. Everything it is worth happens in the grip. */
  damage = 0;
  maxHitCount = 1;

  /** It runs along the ground it is crossing, so it lights that ground. */
  visionRadius = SIGHT.IMPACT;

  private ageMs = 0;
  private ridge: { along: number; height: number; phase: number }[] = [];

  onAdded(): void {
    super.onAdded();
    for (let grain = 0; grain < 18; grain++) {
      this.ridge.push({
        along: Math.random() * 2 - 1,
        height: 0.5 + Math.random() * 0.7,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  update(): void {
    super.update();
    this.ageMs += deltaTime;
  }

  onHit(target: AttackableUnit): void {
    // The wave arrives and becomes the grip. Nothing is dealt here: the
    // damage, the root and the crush all belong to the thing that holds them.
    const grip = new Gaara_R_Grip(this.owner);
    grip.position.set(target.position.x, target.position.y);
    grip.attachTo(target);
    this.game.objectManager.addObject(grip);

    const root = new api.buffs.Root(this.rootMs, this.owner, target);
    root.image = this.rootImage;
    target.addBuff(root);
  }

  /** Written by the spell, so the numbers live in one file. */
  rootMs = 0;
  rootImage: ReturnType<typeof api.asset> | undefined = undefined;

  getDisplayBoundingBox(): Rectangle {
    const reach = this.size + 40;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  /** Ground art: the wave runs along the floor, under the feet it is chasing. */
  zIndex = api.layers.GROUND_Z_INDEX;

  draw(): void {
    const head = this.position;
    const heading = Math.atan2(this.direction?.y ?? 0, this.direction?.x ?? 1);
    const half = this.size / 2;
    // A crest that rolls rather than a disc that slides. A shape travelling
    // at a constant size with no internal motion reads as a decal being
    // dragged, which is exactly what the first cut of this looked like.
    const roll = this.ageMs / 90;

    push();
    translate(head.x, head.y);
    rotate(heading);

    noStroke();
    // The trailing skirt: sand that has not caught up yet. It is what makes
    // the direction of travel legible from a single frame.
    fill(150, 116, 66, 120);
    ellipse(-half * 0.8, 0, this.size * 1.5, this.size * 1.15);

    fill(178, 142, 86, 210);
    ellipse(0, 0, this.size * 0.95, this.size * 1.05);

    for (const grain of this.ridge) {
      const y = grain.along * half * 0.85;
      const lift = Math.sin(roll + grain.phase) * 0.5 + 0.5;
      const tall = half * 0.5 * grain.height * (0.55 + 0.45 * lift);
      fill(74, 52, 26, 215);
      triangle(half * 0.1 - 4, y - 4, half * 0.1 + 4, y + 4, half * 0.1 + tall, y);
      fill(214, 184, 128, 235);
      triangle(half * 0.1 - 3, y - 3, half * 0.1 + 3, y + 3, half * 0.1 + tall * 0.8, y);
    }

    // A hard leading edge on the width the collision really uses, so the
    // player can read what the wave will and will not catch.
    noFill();
    stroke(64, 44, 22, 235);
    strokeWeight(3);
    arc(0, 0, this.size, this.size * 1.05, -QUARTER_TURN, QUARTER_TURN);
    pop();
  }
}
