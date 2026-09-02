import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { SIGHT } from '../spellVfx';
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
 * World units per frame a caught body is dragged toward the eye, at the rim.
 *
 * Small on purpose. This is weight, not a displacement: a player who wants to
 * leave still leaves, they just leave *late*, and the spiral visibly costs
 * them the distance. A pull strong enough to hold someone in place would be a
 * root wearing a different name, which is a much bigger ability than this.
 */
export const VORTEX_PULL_PER_FRAME = 0.9;

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
 * So: grow (180ms), hold, fade (520ms, rim last). Total just over a second,
 * which is long enough to read and short enough not to sit on top of the next
 * trade.
 *
 * ## The bite lands on contact, not at the end of the grow
 *
 * It used to wait out `VORTEX_GROW_MS` on the rule that "a blast that damages
 * before it has drawn its own radius is a blast the victim could not have
 * read". That rule is right, and it is about a *telegraph* — `Gaara_Q` and
 * `Kakashi_Q` both name theirs `Q_TELL_MS`, and `Naruto_E2_Detonation` is a
 * bomb somebody planted. This is not one of those. The warning for a Rasengan
 * is the sphere crossing the lane, which the victim watched for its whole
 * flight and could walk out of; by the time this object exists the throw has
 * already connected.
 *
 * So the wait bought nothing and cost the hit: "chiêu nổ rồi mà khoảng
 * 100-200ms sau mới thấy apply damage" — 180 of them, exactly. It also made
 * the ability's own Kurama form contradict it. `Naruto_Q2.detonate` deals its
 * splash and spawns `Naruto_Q2_Scorch` in the same frame, and that scorch says
 * outright what this object should also have been: "purely a reading, no
 * damage, no slow, nothing to balance". Two versions of one ability, opposite
 * shapes, and the delayed one is the outlier.
 *
 * The grow is still 180ms and still eases — it just animates a hit that has
 * already happened, which is what every other dissipation in this pack does.
 */
export class Naruto_Q_Vortex extends api.SpellObject {
  /**
   * The Rasengan bursts where it lands — see who it caught, and whether to follow it in.
   *
   * `FogOfWar` reads `visionRadius` off any object and casts the same
   * wall-aware polygon it casts for a champion, so this one number is the
   * whole feature — and the effect's own lifetime is the window. See
   * `SIGHT` in `spellVfx.ts` for why the bands differ.
   */
  visionRadius = SIGHT.IMPACT;

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
    // **First tick, not `onAdded`.** `ObjectManager` wraps `update()` in
    // `beginAttribution(attributedTo)` and does *not* wrap `onAdded` — so a
    // bite from there runs with no attribution, `abilityPowerScales()` answers
    // false, and `takeDamage` skips the caster's ability power entirely. That
    // shipped for one commit: six Mũ Phù Thủy, a tooltip promising 48 (+835),
    // and 31 damage on the floor, which is the base number with the build
    // thrown away. One frame is 16ms and the delay this was fixing was 180.
    this.biteOnce();

    this.ageMs += deltaTime;

    // The drag runs the whole time the spiral is turning, and stops when it
    // starts to fade — an effect that is visibly dying must not still be
    // moving people, or the picture and the physics disagree.
    if (this.ageMs < VORTEX_GROW_MS + VORTEX_HOLD_MS) this.drag();

    if (this.ageMs >= this.totalMs) this.toRemove = true;
  }

  /**
   * Drags what is inside toward the eye, harder at the rim than at the centre.
   *
   * Falling off toward the middle is what stops the pull from jittering a body
   * that has already arrived: at the eye the step is zero, so a unit settles
   * instead of oscillating across the centre point every frame.
   *
   * `markDisplaced` because this moves a body without its own consent — the
   * separation pass has to leave it alone for a few frames or it will shove it
   * straight back out. Written as a direct step rather than a `Dash`: a Dash
   * takes the victim's movement away entirely, and the whole point here is
   * that they keep it and are merely slower to escape.
   */
  private drag(): void {
    const caught = this.game.objectManager.queryObjects({
      area: new Circle({ x: this.position.x, y: this.position.y, r: this.radius }),
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];

    for (const unit of caught) {
      // Scenery, bosses that hold their ground, and anything already being
      // thrown by someone else. Two rules shoving one body in opposite
      // directions is worse than not pulling at all.
      if (unit.isImmovable || unit.isDead) continue;

      const dx = this.position.x - unit.position.x;
      const dy = this.position.y - unit.position.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 1) continue;

      const grip = Math.min(1, distance / this.radius);
      const step = VORTEX_PULL_PER_FRAME * grip * (deltaTime / 16.67);
      unit.position.set(
        unit.position.x + (dx / distance) * step,
        unit.position.y + (dy / distance) * step
      );
      unit.markDisplaced?.();
    }
  }

  /** Idempotent: the clock is gone, so this is the only thing keeping it once. */
  private biteOnce(): void {
    if (this.bitten) return;
    this.bitten = true;
    this.bite();
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
