import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { clamp01, snapOut } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;
const Circle = api.utils.Quadtree.Circle;

/** How long the vortex spends arriving, biting, and leaving. */
export const VORTEX_GROW_MS = 180;
export const VORTEX_HOLD_MS = 420;
export const VORTEX_FADE_MS = 520;
export const VORTEX_SLOW_PERCENT = 0.4;
export const VORTEX_SLOW_MS = 1_400;

/**
 * The aftermath of a Rasengan: a spiral of ground-up chakra that keeps
 * turning where the sphere burst.
 *
 * ## It is its own object because the phases outlive each other
 *
 * The missile's job ends the instant it connects. What the *player* needs
 * after that is the shape of the area it caught, held on screen long enough
 * to be read — see `docs/VFX_STANDARD.md`'s phases section, which this
 * ability is the worked example for. An effect deleted on the frame it deals
 * damage teaches nothing, and the floating number is the only evidence it
 * ever existed.
 *
 * So: grow (180ms), bite (the damage and the slow land once, at the start of
 * the hold), fade (520ms, rim last). Total just over a second, which is long
 * enough to read and short enough not to sit on top of the next trade.
 */
export class Naruto_Q_Vortex extends api.SpellObject {
  /** Set by the missile from its own charge ratio. */
  radius = 130;
  damage = 0;

  private ageMs = 0;
  private bitten = false;
  /** Seeded once — `random()` in `draw` flickers instead of animating. */
  private arms: number[] = [];
  private burst = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(190, 230, 255, 0.85)',
    0.4
  );

  onAdded(): void {
    this.useParticles(this.burst);
    for (let arm = 0; arm < 5; arm++) this.arms.push((arm / 5) * Math.PI * 2);
  }

  private get totalMs(): number {
    return VORTEX_GROW_MS + VORTEX_HOLD_MS + VORTEX_FADE_MS;
  }

  update(): void {
    this.ageMs += deltaTime;

    // The bite lands once, when the spiral reaches full width — not on spawn.
    // A blast that damages before it has drawn its own radius is a blast the
    // victim could not have read.
    if (!this.bitten && this.ageMs >= VORTEX_GROW_MS) {
      this.bitten = true;
      this.bite();
    }

    if (this.ageMs >= this.totalMs) this.toRemove = true;
  }

  private bite(): void {
    const caught = this.game.objectManager.queryObjects({
      area: new Circle({ x: this.position.x, y: this.position.y, r: this.radius }),
      // No vision filter: this is an area that grinds whatever it overlaps, so
      // someone standing in an unlit bush inside it must still be caught.
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];

    for (const unit of caught) {
      unit.takeDamage(this.damage, this.owner);
      const slow = new api.buffs.Slow(VORTEX_SLOW_MS, this.owner, unit);
      slow.percent = VORTEX_SLOW_PERCENT;
      slow.image = api.asset('spell_naruto_q');
      unit.addBuff(slow);

      // On each victim, so the player reads *who* the spiral caught rather
      // than only that something happened here.
      for (let grain = 0; grain < 7; grain++) {
        const angle = Math.random() * Math.PI * 2;
        this.burst.addParticle({
          x: unit.position.x + Math.cos(angle) * 14,
          y: unit.position.y + Math.sin(angle) * 14,
          r: 8 + Math.random() * 5,
        });
      }
    }
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
    const eye = this.position;

    // One normalized progress per phase, each with its own ease — the shape
    // the standard asks for, and what keeps the three stages legible as three.
    const growing = clamp01(this.ageMs / VORTEX_GROW_MS);
    const fading = clamp01((this.ageMs - VORTEX_GROW_MS - VORTEX_HOLD_MS) / VORTEX_FADE_MS);
    const span = this.radius * 2 * snapOut(growing);
    const alpha = 1 - fading;
    const spin = this.ageMs / 90;

    push();
    noStroke();
    // The fill goes first and dies first: by the end of the fade only the rim
    // is left, which is the part that was carrying the radius.
    fill(90, 165, 255, 70 * alpha * alpha);
    circle(eye.x, eye.y, span);
    fill(140, 200, 255, 45 * alpha * alpha);
    circle(eye.x, eye.y, span * 0.6);

    // Spiral arms, drawn as arcs that trail inward. They turn the whole life
    // of the effect, so a player sees it *spinning down* rather than simply
    // dimming.
    noFill();
    for (let ring = 0; ring < this.arms.length; ring++) {
      const phase = this.arms[ring] + spin * (1 - ring * 0.12);
      const width = span * (0.95 - ring * 0.16);
      stroke(200, 235, 255, 190 * alpha);
      strokeWeight(3.5 - ring * 0.4);
      arc(eye.x, eye.y, width, width, phase, phase + 1.8);
    }

    // The rim, on the real damage radius, and the last thing to go.
    stroke(225, 245, 255, 235 * alpha);
    strokeWeight(2.5);
    circle(eye.x, eye.y, this.radius * 2 * snapOut(growing));
    pop();
  }
}
