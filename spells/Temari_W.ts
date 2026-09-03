import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { RANGE_BAND, SIGHT, WIND, clamp01, snapOut, windIn } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;
const Circle = api.utils.Quadtree.Circle;
const dmgValue = api.text.dmgValue;

/**
 * Fūton: Tatsumaki — she puts a turning column of air on the ground, and it
 * will not let go.
 *
 * The script:
 *
 *   press a point within 430  → a vortex opens there
 *   for 2.2 seconds           → anyone inside is dragged toward its middle
 *                             → and slowed while they are in it
 *   every 0.4s                → it takes 5 off each of them
 *   at the end                → it spins down and lets go
 *
 * ## The first pull in the pack
 *
 * Four champions can push, throw, shove and knock people up; nobody could
 * bring one *closer*. That is the gap this fills, and it is the reason her
 * kit works at all: her Q blows people away, so without one button that
 * gathers them she is a champion whose own abilities undo each other.
 *
 * Placed rather than aimed at a body on purpose — a pull that locks on is a
 * displacement nobody can answer, and this engine has already rebuilt one
 * ultimate for exactly that ("instant quá, địch ko né đc").
 */
export const W_RANGE = RANGE_BAND.ABILITY;
export const W_RADIUS = 130;
export const W_DURATION_MS = 2_200;
export const W_TICK_MS = 400;
export const W_TICK_DAMAGE = 5;
/**
 * How many bites one full vortex actually lands.
 *
 * `ceil - 1`, not `floor`: the loop runs only while the vortex is *still
 * turning*, so a tick falling exactly on the last millisecond never fires.
 * Written the way the loop counts rather than the way the arithmetic looks —
 * this pack has had the two disagree twice, and the tooltip believed the
 * arithmetic both times.
 */
export const W_TICKS = Math.ceil(W_DURATION_MS / W_TICK_MS) - 1;
export const W_TOTAL_DAMAGE = W_TICK_DAMAGE * W_TICKS;
export const W_SLOW = 0.3;
/** How far a body is dragged inward per pull, and how long each drag takes. */
export const W_PULL = 26;
export const W_PULL_MS = 300;
/** Dissipation: it spins down rather than blinking out. */
export const W_FADE_MS = 380;
export const W_COOLDOWN_MS = 11_000;
export const W_CHAKRA = 60;

/**
 * Drag a body toward a point, through the engine's own displacement seam.
 *
 * Exported because her ultimate does the same thing while travelling, and a
 * second copy of this is a second place for the pull to drift. `Dash`'s own
 * `buffAddType` is `REPLACE_EXISTING`, so re-applying it every few hundred
 * milliseconds reads as one continuous drag rather than as a stack.
 *
 * `buffsToCheckCancel: []` on purpose: a spell that pulls a victim and also
 * slows them must not have its own pull cancelled by its own slow. That is
 * the exact case `Dash.buffsToCheckCancel` documents.
 */
export const dragToward = (
  victim: AttackableUnit,
  by: AttackableUnit,
  to: { x: number; y: number },
  distance: number,
  overMs: number,
  image: ReturnType<typeof api.asset>
): void => {
  const dx = to.x - victim.position.x;
  const dy = to.y - victim.position.y;
  const gap = Math.hypot(dx, dy);
  if (gap < 4) return;
  const step = Math.min(distance, gap);

  const dragged = new api.buffs.Dash(overMs + 80, by, victim);
  dragged.image = image;
  dragged.dashDestination = createVector(
    victim.position.x + (dx / gap) * step,
    victim.position.y + (dy / gap) * step
  );
  dragged.dashSpeed = (step / overMs) * (1000 / 60);
  dragged.cancelable = false;
  dragged.showTrail = false;
  dragged.buffsToCheckCancel = [];
  victim.addBuff(dragged);
};

export class Temari_W_Vortex extends api.SpellObject {
  /** A placed effect that stays, so it holds the ground it is turning on. */
  visionRadius = SIGHT.ZONE;

  private ageMs = 0;
  private sinceTick = 0;
  private sincePull = 0;

  update(): void {
    this.ageMs += deltaTime;
    if (this.ageMs >= W_DURATION_MS + W_FADE_MS) {
      this.toRemove = true;
      return;
    }
    if (this.ageMs >= W_DURATION_MS) return;

    const caught = this.inside();

    this.sincePull += deltaTime;
    while (this.sincePull >= W_PULL_MS) {
      this.sincePull -= W_PULL_MS;
      for (const victim of caught) {
        dragToward(
          victim,
          this.owner,
          this.position,
          W_PULL,
          W_PULL_MS,
          api.asset('spell_temari_w')
        );
      }
    }

    this.sinceTick += deltaTime;
    while (this.sinceTick >= W_TICK_MS) {
      this.sinceTick -= W_TICK_MS;
      for (const victim of caught) {
        victim.takeDamage(W_TICK_DAMAGE, this.owner, 'MAGIC', 'Fūton: Tatsumaki');
      }
    }

    for (const victim of caught) {
      const slowed = new api.buffs.Slow(W_TICK_MS + 120, this.owner, victim);
      slowed.percent = W_SLOW;
      slowed.image = api.asset('spell_temari_w');
      // `Slow` stacks ten deep by default, and this re-applies every frame:
      // without this a 30% slow becomes a standstill in a fifth of a second.
      slowed.buffAddType = api.enums.BuffAddType.RENEW_EXISTING;
      victim.addBuff(slowed);
    }
  }

  private inside(): AttackableUnit[] {
    return this.game.objectManager.queryObjects({
      area: new Circle({ x: this.position.x, y: this.position.y, r: W_RADIUS }),
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = W_RADIUS + 40;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  draw(): void {
    const opening = clamp01(this.ageMs / 220);
    const closing = clamp01((this.ageMs - W_DURATION_MS) / W_FADE_MS);
    const alpha = 1 - closing;
    // It spins *down* rather than dimming: the third phase is a movement.
    const spin = this.ageMs / 260;
    const size = W_RADIUS * (0.35 + 0.65 * snapOut(opening)) * (1 - closing * 0.35);
    if (size <= 1) return;

    push();
    translate(this.position.x, this.position.y);

    noStroke();
    fill(WIND.PALE[0], WIND.PALE[1], WIND.PALE[2], 18 * alpha);
    circle(0, 0, size * 2);

    // The spiral, winding **inward** — the direction the ability moves
    // people. An outward-spinning picture over an inward pull would tell the
    // player the opposite of what the game just did.
    noFill();
    stroke(WIND.EDGE[0], WIND.EDGE[1], WIND.EDGE[2], 215 * alpha);
    // Heavy, because the *turn* is what the ability is. Drawn at four pixels
    // beside three bright rings it came back reading as concentric circles —
    // found in the renderer, where "does this look like it is spinning" is
    // the only place the question can be asked.
    strokeWeight(6.5);
    beginShape();
    for (let step = 0; step <= 110; step++) {
      const t = step / 110;
      const at = spin + t * Math.PI * 5.5;
      const r = size * (1 - t * 0.86);
      vertex(Math.cos(at) * r, Math.sin(at) * r * 0.82);
    }
    endShape();

    // Rings at three heights, squashed, so a flat canvas reads it as a
    // column rather than as a disc with a doodle on it.
    for (let ring = 0; ring < 2; ring++) {
      const r = size * (0.4 + ring * 0.28);
      stroke(WIND.PALE[0], WIND.PALE[1], WIND.PALE[2], (105 - ring * 35) * alpha);
      strokeWeight(2.5);
      ellipse(0, -ring * 9 * windIn(opening), r * 2, r * 1.6);
    }

    // The rim, on the radius the pull and the damage both use, and the last
    // thing to go — the next one is placed by somebody who saw this one.
    stroke(WIND.EDGE[0], WIND.EDGE[1], WIND.EDGE[2], 235 * alpha);
    strokeWeight(3);
    circle(0, 0, W_RADIUS * 2);
    pop();
  }
}

export default class Temari_W extends api.Spell {
  /**
   * Told, not inferred. Inference reads a `POINT` cast as `Damage | Poke`, and
   * 25 damage over two seconds is not why anybody presses this — the drag is.
   * `Cc` is the term `scoreSpell` actually pays for.
   */
  static aiRoles = api.enums.SpellRole.Cc | api.enums.SpellRole.Damage;

  name = 'Fūton: Tatsumaki';
  image = api.asset('spell_temari_w');
  description =
    'Dựng một cột gió xoáy tại điểm chỉ định trong <span class="time">2.2 giây</span>. Kẻ địch ' +
    'bên trong bị <b>kéo vào giữa</b>, <span class="buff">làm chậm 30%</span> và nhận ' +
    `${dmgValue(5, 'MAGIC')} mỗi <span class="time">0.4 giây</span>.`;
  coolDown = W_COOLDOWN_MS;
  manaCost = W_CHAKRA;
  targetingMode = 'POINT' as const;
  range = W_RANGE;

  onSpellCast(): void {
    const at = api.utils.VectorUtils.getVectorWithMaxRange(
      this.owner.position,
      this.aimPoint,
      W_RANGE
    ).to;

    const vortex = new Temari_W_Vortex(this.owner);
    vortex.position.set(at.x, at.y);
    this.game.objectManager.addObject(vortex);
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
