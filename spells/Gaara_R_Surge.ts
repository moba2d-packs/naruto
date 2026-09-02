import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { SIGHT, clamp01, impactBurst, snapOut } from '../spellVfx';
import { Gaara_R_Grip } from './Gaara_R_Grip';

const QRectangle = api.utils.Quadtree.Rectangle;

/** p5's `HALF_PI` only exists inside a running sketch. The value is not in doubt. */
const QUARTER_TURN = Math.PI / 2;

export const SURGE_SPEED = 7.5;
/**
 * How long the wave takes to collapse onto whoever it caught.
 *
 * It used to be zero: `removeOnMaxHit` defaults true, so the surge set
 * `toRemove` on the very frame it landed and the sand simply stopped
 * existing, with the grip's jaws appearing at full size in its place.
 * Reported as "lúc chạm mục tiêu lại biến mất, rồi những cái gai hiện ngay
 * luôn, ko có transition" — the dissipation phase missing, which
 * `docs/VFX_STANDARD.md` says is always the one that gets skipped.
 *
 * The two effects now overlap: the wave slumps into the body over this
 * window while the grip rises out of it, so there is no frame with neither.
 */
export const SURGE_COLLAPSE_MS = 280;
/**
 * The wave's width, which is also its hitbox: `MissileSpellObject` collides on
 * a circle of `size / 2`. Widened from 74 for the same reason the art was
 * redrawn — at 74 this was the size of an ordinary fireball, and an ultimate
 * that looks like a Q is one nobody respects. It is affordable because the
 * ability is slow and dodgeable: the counterplay is stepping aside, and a
 * wider wave asks for a slightly earlier step, not a different answer.
 */
export const SURGE_WIDTH = 110;

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
  /**
   * The wave outlives its own hit. `MissileSpellObject` would otherwise mark
   * it removed on the landing frame — see `SURGE_COLLAPSE_MS`.
   */
  removeOnMaxHit = false;

  /** It runs along the ground it is crossing, so it lights that ground. */
  visionRadius = SIGHT.IMPACT;

  private ageMs = 0;

  /**
   * The ridges, rooted along the crest and seeded once.
   *
   * `across` is the position along the wave front, −1 to 1. That is the whole
   * point: ridges grow from a *line* and all point forward, so they read as a
   * wave front. Rooted at a point and fanned out instead, they read as a mace
   * — which is exactly what the first cut of this looked like, and the same
   * mistake Kurama Arms' fingers made before them.
   */
  private ridges: { across: number; height: number; lean: number; phase: number; width: number }[] =
    [];

  /** Loose sand, in the mass and streaming behind it. Sand is granular. */
  private grains: { back: number; side: number; size: number; phase: number }[] = [];

  /** Speed lines. Motion reads as streaks far better than as a dark cone. */
  private streaks: { side: number; length: number }[] = [];

  onAdded(): void {
    super.onAdded();
    this.useParticles(this.burst);
    for (let i = 0; i < 13; i++) {
      const across = -1 + (2 * (i + 0.5)) / 13;
      this.ridges.push({
        across,
        // Tallest in the middle, so the front bows forward where the wave is
        // deepest rather than being a comb of equal teeth.
        height: (0.45 + 0.55 * (1 - across * across)) * (0.75 + Math.random() * 0.5),
        lean: (Math.random() - 0.5) * 0.3,
        phase: Math.random() * Math.PI * 2,
        width: 0.075 + Math.random() * 0.045,
      });
    }
    for (let i = 0; i < 22; i++) {
      this.grains.push({
        back: Math.pow(Math.random(), 0.6),
        side: Math.random() * 2 - 1,
        size: 1.5 + Math.random() * 3.2,
        phase: Math.random() * Math.PI * 2,
      });
    }
    for (let i = 0; i < 8; i++) {
      this.streaks.push({ side: (i - 3.5) / 4, length: 1.3 + Math.random() * 2 });
    }
  }

  /** When the wave caught somebody, in its own ms. `null` while still flying. */
  private caughtAtMs: number | null = null;
  private caught: AttackableUnit | null = null;

  private burst = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(214, 184, 128, 0.92)',
    0.45
  );

  update(): void {
    // Once it has hold of somebody it stops being a missile: no more travel,
    // no more collision scanning, just the collapse. Driving the base class
    // past the catch would walk the sand off the body it caught.
    if (this.caughtAtMs === null) super.update();
    this.ageMs += deltaTime;

    if (this.caughtAtMs === null) return;
    const victim = this.caught;
    // It sits on whoever it took, even if something else displaces them.
    if (victim && !victim.toRemove) this.position.set(victim.position.x, victim.position.y);
    if (this.ageMs - this.caughtAtMs >= SURGE_COLLAPSE_MS) this.toRemove = true;
  }

  /** 0 while flying, 0..1 across the collapse. Drives every value in `draw`. */
  private get collapse(): number {
    if (this.caughtAtMs === null) return 0;
    return clamp01((this.ageMs - this.caughtAtMs) / SURGE_COLLAPSE_MS);
  }

  onHit(target: AttackableUnit): void {
    this.caughtAtMs = this.ageMs;
    this.caught = target;
    this.position.set(target.position.x, target.position.y);

    // The catch has to show **on the victim**. Without this the only evidence
    // the wave connected was a buff icon, which is not a thing anybody reads
    // mid-fight — the standard's third rule, and the half of "no transition"
    // that redrawing the wave could not have fixed.
    impactBurst(this.burst, target.position, 18, 34, 14);

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

  /** Ground art: the wave runs along the floor, under the feet it is chasing. */
  zIndex = api.layers.GROUND_Z_INDEX;

  getDisplayBoundingBox(): Rectangle {
    // The streaks reach about three radii *behind* the head, in whatever
    // direction it happens to be going — so the box is a square wide enough
    // to hold the tail at any heading, not one sized to the missile.
    const reach = this.size * 2;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  /**
   * Where the wave is pointed.
   *
   * `MissileSpellObject` has **no `direction` field** — it carries `position`
   * and `destination`, and its own `draw()` derives the angle from the two.
   * The first cut of this reached for `this.direction`, got `undefined`, fell
   * through to `atan2(0, 1)` and drew every wave pointing due east however it
   * was aimed. Reported as "ko render quay theo hướng đang bay", and invisible
   * from the file: the fallback made it look deliberate.
   */
  private heading(): number {
    return Math.atan2(
      this.destination.y - this.position.y,
      this.destination.x - this.position.x
    );
  }

  /** The crest line: a shallow bow across the travel direction. */
  private crest(across: number): { x: number; y: number } {
    const half = this.size / 2;
    return { x: half * 0.3 * (1 - across * across), y: across * half * 0.98 };
  }

  draw(): void {
    const half = this.size / 2;
    const roll = this.ageMs / 95;
    // The collapse: the wave loses its speed lines first, then slumps forward
    // into the body and fades. `snapOut` so it arrives hard and settles,
    // which is what a mass of sand hitting somebody does.
    const shut = snapOut(this.collapse);
    const alive = 1 - this.collapse;

    push();
    translate(this.position.x, this.position.y);
    rotate(this.heading());
    // Sinking into the victim rather than shrinking on the spot: the sand is
    // going somewhere, and where it is going is *onto them*.
    scale(1 - shut * 0.34);

    // Speed lines, behind. One layer, low alpha: they say "fast" and nothing
    // else, so they must not compete with the crest for attention.
    noStroke();
    fill(165, 129, 63, 55 * (1 - shut));
    for (const streak of this.streaks) {
      const length = half * streak.length;
      rect(-half * 0.5 - length, streak.side * half * 0.6 - 2, length, 4, 2);
    }

    // The bank: a lens, thick at the middle and thinning at the wings. Drawn
    // as one filled shape twice rather than as nested circles, because a
    // circle is a ball and this is a wall of sand being pushed.
    for (const [scale, colour] of [
      [1, [107, 80, 39]],
      [0.82, [165, 129, 63]],
    ] as const) {
      fill(colour[0], colour[1], colour[2], 235 * alive);
      beginShape();
      for (let i = 0; i <= 24; i++) {
        const across = -1 + (2 * i) / 24;
        const point = this.crest(across);
        vertex(point.x * scale, point.y * scale);
      }
      for (let i = 24; i >= 0; i--) {
        const across = -1 + (2 * i) / 24;
        const point = this.crest(across);
        vertex((-half * 0.62 * (1 - across * across) - half * 0.12) * scale, point.y * 0.92 * scale);
      }
      endShape(CLOSE);
    }

    // Loose grains, drifting backward on their own phase.
    for (const grain of this.grains) {
      const drift = (grain.back + ((roll * 0.12 + grain.phase) % 1) * 0.35) % 1;
      const x = half * 0.2 - drift * half * 2.6;
      const y = grain.side * half * 1.7 * (1 - drift * 0.4);
      fill(216, 188, 134, 205 * (1 - drift * 0.65) * alive);
      circle(x, y, grain.size * (1 - drift * 0.45) * 2);
    }

    // The ridges. Rooted along the crest, all pointing forward, each churning
    // on its own phase — one shared wobble would read as a blinking decal.
    for (const ridge of this.ridges) {
      const root = this.crest(ridge.across);
      const churn = 0.78 + 0.22 * Math.sin(roll + ridge.phase);
      const length = half * 0.68 * ridge.height * churn * (1 - shut * 0.55);
      const width = half * ridge.width;
      const tipX = root.x + length;
      const tipY = root.y + ridge.lean * length;

      // A dark rim under *each* ridge rather than around the group, or the
      // whole front merges into one blob at a glance.
      fill(61, 43, 18, 235 * alive);
      triangle(root.x - width * 0.2, root.y - width, root.x - width * 0.2, root.y + width, tipX, tipY);
      fill(205, 170, 112, 240 * alive);
      triangle(
        root.x - width * 0.2,
        root.y - width * 0.58,
        root.x - width * 0.2,
        root.y + width * 0.58,
        tipX - length * 0.16,
        tipY
      );
    }

    // The hitbox, stated. `MissileSpellObject` collides on a circle of
    // `size / 2`, and the churning front is deliberately irregular — so
    // without this the player would be reading the *ridges* as the edge and
    // guessing wrong every time the tallest one happened to be short.
    // Thin, so it says where the edge is without competing with the crest.
    noFill();
    stroke(58, 42, 18, 150 * (1 - this.collapse * 0.5));
    strokeWeight(2);
    arc(0, 0, this.size, this.size, -QUARTER_TURN * 1.15, QUARTER_TURN * 1.15);
    noStroke();

    pop();
  }
}
