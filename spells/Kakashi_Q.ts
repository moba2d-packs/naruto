import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { KAMUI, clamp01, impactSpray, snapOut, windIn } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;
const Circle = api.utils.Quadtree.Circle;

/**
 * Chidori Nagashi — the lightning does not go anywhere. It comes off him.
 *
 * The script:
 *
 *   press              → it gathers on him for 0.2s, visibly
 *   then               → it earths itself outward in every direction
 *   whoever is inside  → takes 26 and is stunned for 0.55s
 *   after              → the arcs crawl outward and go out
 *
 * ## The pack's only stun
 *
 * Six champions before him could root, slow, disarm, silence, push, pull,
 * throw and knock up. Nobody could take a *turn* away. That is what this
 * adds, and it is why it is short-ranged and on a long cooldown: a stun is
 * the strongest thing in this list and it should cost being in the fight.
 *
 * `Stun` is also the one buff the house convention says **not** to give your
 * own icon — its `draw()` paints `this.image` into the world at body size,
 * and the spinning swirl is how the whole screen answers "who is stunned
 * right now". An ability icon there trades a global readout for a label
 * nobody recognises. `stackId` and the duration are still ours.
 */
export const Q_RADIUS = 190;
/** The gather. Short, but it is the only warning anybody standing on him gets. */
export const Q_TELL_MS = 200;
export const Q_DAMAGE = 26;
export const Q_STUN_MS = 550;
/** Dissipation: the arcs crawl outward and go out. */
export const Q_FADE_MS = 380;
export const Q_COOLDOWN_MS = 9_000;
export const Q_CHAKRA = 50;

const ARCS = 10;

/**
 * The discharge: gathered, earthed, gone.
 *
 * Rides his body — it comes *off* him, so it goes where he goes and dies with
 * him. Dark (no `visionRadius`): it happens at his own feet.
 */
export class Kakashi_Q_Discharge extends api.SpellObject {
  private ageMs = 0;
  private earthed = false;
  /** Seeded once: arcs that re-roll their kinks every frame flicker. */
  private arcs: { at: number; kink: number[]; reach: number }[] = [];

  private sparks = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(226, 232, 255, 0.9)',
    0.55
  );

  onAdded(): void {
    for (let arc = 0; arc < ARCS; arc++) {
      this.arcs.push({
        at: (arc / ARCS) * Math.PI * 2 + Math.random() * 0.3,
        kink: [
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.6,
          (Math.random() - 0.5) * 0.4,
        ],
        reach: 0.82 + Math.random() * 0.18,
      });
    }
    this.useParticles(this.sparks);
  }

  update(): void {
    if (this.dropIfAttachmentLost()) return;
    const body = this._anchorUnit as AttackableUnit | null;
    if (body) this.position.set(body.position.x, body.position.y);
    this.ageMs += deltaTime;

    if (!this.earthed && this.ageMs >= Q_TELL_MS) this.earth();
    if (this.ageMs >= Q_TELL_MS + Q_FADE_MS) this.toRemove = true;
  }

  /** Idempotent, like every ending in this pack. */
  private earth(): void {
    if (this.earthed) return;
    this.earthed = true;

    const caught = this.game.objectManager.queryObjects({
      area: new Circle({ x: this.position.x, y: this.position.y, r: Q_RADIUS }),
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];

    for (const victim of caught) {
      victim.takeDamage(Q_DAMAGE, this.owner, 'MAGIC', 'Chidori Nagashi');
      const away = Math.atan2(
        victim.position.y - this.position.y,
        victim.position.x - this.position.x
      );
      impactSpray(this.sparks, victim.position, away, 10, 20, 10);

      const held = new api.buffs.Stun(Q_STUN_MS, this.owner, victim);
      // **No `image` override.** `Stun.draw()` paints its own icon into the
      // world on the victim at body size — the spinning swirl is the game's
      // global answer to "who is stunned". See the class header.
      held.stackId = 'naruto_kakashi_q_stun';
      victim.addBuff(held);
    }
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = Q_RADIUS + 40;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  draw(): void {
    const gathering = clamp01(this.ageMs / Q_TELL_MS);
    const out = this.earthed ? clamp01((this.ageMs - Q_TELL_MS) / Q_FADE_MS) : 0;
    const alpha = 1 - out * 0.9;
    // Gathering *inward* on him, then earthing *outward*. The direction
    // reverses on the frame the damage lands, which is the whole read.
    const reach = this.earthed ? Q_RADIUS * snapOut(out) : Q_RADIUS * 0.18 * windIn(gathering);

    push();
    translate(this.position.x, this.position.y);

    // The rim, on the radius the damage really uses — drawn from the first
    // frame so the warning and the hitbox are the same circle.
    noFill();
    stroke(KAMUI.SPARK[0], KAMUI.SPARK[1], KAMUI.SPARK[2], (this.earthed ? 230 : 120) * alpha);
    strokeWeight(this.earthed ? 3 : 2);
    circle(0, 0, Q_RADIUS * 2);

    // Arcs: kinked polylines, never straight spokes. Straight rays out of a
    // point are the mace this repository has drawn by accident three times;
    // lightning is saved from it by never being straight.
    // **The glow first, every arc, then the hot line.** Written the other way
    // round — thin bright, then wide dark on top — the wide one paints over
    // the bright one and lightning comes out pink. Found in the renderer, and
    // it is the third time this pack has drawn a rim over its own body.
    stroke(KAMUI.EDGE[0], KAMUI.EDGE[1], KAMUI.EDGE[2], 190 * alpha);
    strokeWeight(this.earthed ? 8 : 6);
    for (const arc of this.arcs) this.bolt(arc, reach * 0.96);
    stroke(KAMUI.SPARK[0], KAMUI.SPARK[1], KAMUI.SPARK[2], 250 * alpha);
    strokeWeight(this.earthed ? 3.5 : 2.5);
    for (const arc of this.arcs) this.bolt(arc, reach);

    // The hot centre while it gathers, gone the moment it lets go.
    if (!this.earthed) {
      noStroke();
      fill(KAMUI.SPARK[0], KAMUI.SPARK[1], KAMUI.SPARK[2], 200 * windIn(gathering));
      circle(0, 0, 22 + 14 * gathering);
    }
    pop();
  }

  private bolt(arc: { at: number; kink: number[]; reach: number }, reach: number): void {
    beginShape();
    vertex(0, 0);
    for (let joint = 0; joint < arc.kink.length; joint++) {
      const along = ((joint + 1) / (arc.kink.length + 1)) * reach * arc.reach;
      const at = arc.at + arc.kink[joint];
      vertex(Math.cos(at) * along, Math.sin(at) * along);
    }
    vertex(Math.cos(arc.at) * reach * arc.reach, Math.sin(arc.at) * reach * arc.reach);
    endShape();
  }
}

export default class Kakashi_Q extends api.Spell {
  /**
   * Told, not inferred. Core reads a `SELF` cast as `Buff | Shield`, and both
   * are wrong: nothing about this protects him, and `Shield` in `scoreSpell`
   * means "press this when nearly dead" — the one moment a 190-radius stun
   * that requires standing in the middle of people is worth least.
   */
  static aiRoles = api.enums.SpellRole.Cc | api.enums.SpellRole.Damage;

  name = 'Chidori Nagashi';
  image = api.asset('spell_kakashi_q');
  description =
    'Sét chạy khắp người rồi <b>phóng ra mọi hướng</b> sau <span class="time">0.2 giây</span>: ' +
    '<span class="damage magic">26</span> sát thương và <span class="buff">choáng</span> ' +
    '<span class="time">0.55 giây</span> mọi kẻ địch đứng quanh. Là chiêu <b>choáng duy nhất</b> ' +
    'của cả pack — và anh phải đứng giữa họ mới dùng được.';
  coolDown = Q_COOLDOWN_MS;
  manaCost = Q_CHAKRA;
  targetingMode = 'SELF' as const;
  range = Q_RADIUS;

  onSpellCast(): void {
    const discharge = new Kakashi_Q_Discharge(this.owner);
    discharge.position.set(this.owner.position.x, this.owner.position.y);
    discharge.attachTo(this.owner);
    this.game.objectManager.addObject(discharge);
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
