import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { RANGE_BAND, WIND, clamp01, impactSpray } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;
const Circle = api.utils.Quadtree.Circle;
const dmg = api.text.dmg;
const dmgValue = api.text.dmgValue;

/**
 * Kamaitachi no Jutsu — one swing of the fan, and the air goes with it.
 *
 * The script:
 *
 *   press a direction    → a wide blade of wind leaves the fan
 *   it crosses 430       → in about half a second, through everybody
 *   whoever it passes    → takes 24 and is carried back with it
 *   the far end          → the streamlines thin out and go
 *
 * ## It pierces, and that is the whole ability
 *
 * Every other aimed skillshot in this pack stops on the first body, or ends
 * where it lands. This one does not: it is 150 wide, it goes through a wave
 * and everybody behind it, and it moves each of them a little further from
 * her. She is the champion who does not want anybody close, and the ability
 * that reads as that is one that widens the gap on every press.
 *
 * ## Wind has no body
 *
 * Sand is granular, stone is a slab, shadow is a dark shape with a rim. Wind
 * is the only motif in this pack drawn entirely in **edges** — nested
 * crescents and streamlines, with the gap between them doing the work. That
 * is what keeps five champions from sharing a look.
 */
export const Q_RANGE = RANGE_BAND.ABILITY;
/** How wide the blade cuts. This is the number the drawing has to show. */
export const Q_WIDTH = 150;
/** How deep the blade is along its own travel — thin, because it is an edge. */
export const Q_DEPTH = 46;
/** Pixels per frame. Fast: it is air, not a rock. */
export const Q_SPEED = 15;
/** Roughly how long it takes to cross its whole range, in milliseconds. */
export const Q_TRAVEL_MS = (Q_RANGE / Q_SPEED) * (1000 / 60);
export const Q_DAMAGE = 24;
/** How far a body is carried along with it. */
export const Q_PUSH = 90;
export const Q_PUSH_MS = 220;
/** Dissipation: the streamlines outlive the blade that drew them. */
export const Q_FADE_MS = 300;
export const Q_COOLDOWN_MS = 7_000;
export const Q_CHAKRA = 45;

/**
 * The blade of air: it flies, it cuts through, it thins out.
 *
 * Not a `MissileSpellObject`: that collides as a circle of `size / 2`, and a
 * circle wide enough to be this blade also reaches 75 units *ahead* of it —
 * which would be an effect that damages people it has visibly not touched
 * yet. The hitbox here is the drawn rectangle and nothing else.
 *
 * Dark (no `visionRadius`): it crosses ground rather than landing on it, and
 * an ability that lit a 430-unit lane every seven seconds would be a scouting
 * tool on a poke ability's cooldown.
 */
export class Temari_Q_Gust extends api.SpellObject {
  heading = 0;

  private ageMs = 0;
  private travelled = 0;
  private spentAtMs: number | null = null;
  /** Multi-hit protection: it pierces, so each body is cut once. */
  private cut = new Set<AttackableUnit>();
  /** Seeded once — streamlines that re-roll every frame flicker. */
  private lines: { at: number; length: number; lag: number }[] = [];

  private mist = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(205, 239, 251, 0.8)',
    0.55
  );

  onAdded(): void {
    for (let stream = 0; stream < 9; stream++) {
      this.lines.push({
        at: -1 + (stream / 8) * 2,
        length: 34 + Math.random() * 52,
        lag: 20 + Math.random() * 26,
      });
    }
    this.useParticles(this.mist);
  }

  update(): void {
    this.ageMs += deltaTime;

    if (this.spentAtMs !== null) {
      if (this.ageMs - this.spentAtMs >= Q_FADE_MS) this.toRemove = true;
      return;
    }

    const step = Q_SPEED * (deltaTime / (1000 / 60));
    this.travelled += step;
    this.position.set(
      this.position.x + Math.cos(this.heading) * step,
      this.position.y + Math.sin(this.heading) * step
    );

    this.cutThrough();

    // It does not vanish at the end of its range — it *stops cutting* and
    // the air it moved carries on for another third of a second. An effect
    // deleted on the frame it finishes teaches the player nothing.
    if (this.travelled >= Q_RANGE) this.spentAtMs = this.ageMs;
  }

  private cutThrough(): void {
    const caught = this.game.objectManager.queryObjects({
      area: new Circle({
        x: this.position.x,
        y: this.position.y,
        r: Q_WIDTH / 2 + Q_DEPTH,
      }),
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];

    const alongX = Math.cos(this.heading);
    const alongY = Math.sin(this.heading);
    for (const victim of caught) {
      if (this.cut.has(victim)) continue;
      const dx = victim.position.x - this.position.x;
      const dy = victim.position.y - this.position.y;
      // The rectangle the blade actually is: `Q_DEPTH` along its travel,
      // `Q_WIDTH` across it. Exactly the shape `draw` paints.
      if (Math.abs(dx * alongX + dy * alongY) > Q_DEPTH / 2) continue;
      if (Math.abs(-dx * alongY + dy * alongX) > Q_WIDTH / 2) continue;

      this.cut.add(victim);
      victim.takeDamage(Q_DAMAGE, this.owner, 'MAGIC', 'Kamaitachi no Jutsu');
      impactSpray(this.mist, victim.position, this.heading, 10, 24, 11);
      this.carry(victim);
    }
  }

  /** Carried the way the wind went — never outward from a centre. */
  private carry(victim: AttackableUnit): void {
    const blown = new api.buffs.Dash(Q_PUSH_MS + 120, this.owner, victim);
    blown.image = api.asset('spell_temari_q');
    blown.dashDestination = createVector(
      victim.position.x + Math.cos(this.heading) * Q_PUSH,
      victim.position.y + Math.sin(this.heading) * Q_PUSH
    );
    blown.dashSpeed = (Q_PUSH / Q_PUSH_MS) * (1000 / 60);
    blown.cancelable = false;
    blown.showTrail = false;
    blown.buffsToCheckCancel = [];
    victim.addBuff(blown);
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = Q_WIDTH / 2 + 90;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  draw(): void {
    const spent = this.spentAtMs === null ? 0 : clamp01((this.ageMs - this.spentAtMs) / Q_FADE_MS);
    const alpha = 1 - spent;
    const half = Q_WIDTH / 2;

    push();
    translate(this.position.x, this.position.y);
    rotate(this.heading);

    // The hitbox, stated plainly: the rectangle the damage test uses. Faint,
    // because the crescents are the subject — but present, because an effect
    // that draws only its bright edge is an effect the player reads as
    // narrower than it is.
    noStroke();
    fill(WIND.PALE[0], WIND.PALE[1], WIND.PALE[2], 34 * alpha);
    rect(-Q_DEPTH / 2, -half, Q_DEPTH, Q_WIDTH);
    // And its outline, because the streamlines trail 90 units behind the
    // blade and without this the picture claims a depth the hit does not
    // have. An effect that over-states its area teaches "I should have been
    // hit", which is the same class of lie as one that under-states it.
    noFill();
    stroke(WIND.PALE[0], WIND.PALE[1], WIND.PALE[2], 110 * alpha);
    strokeWeight(1.5);
    rect(-Q_DEPTH / 2, -half, Q_DEPTH, Q_WIDTH);

    // Three crescents, the front one hardest. They bow forward, which is the
    // way the whole thing is going.
    noFill();
    for (let layer = 0; layer < 3; layer++) {
      const back = layer * 16;
      const bright = layer === 0;
      stroke(
        bright ? WIND.EDGE[0] : WIND.PALE[0],
        bright ? WIND.EDGE[1] : WIND.PALE[1],
        bright ? WIND.EDGE[2] : WIND.PALE[2],
        (245 - layer * 70) * alpha
      );
      strokeWeight(7 - layer * 2);
      this.bow(-back, half - layer * 6, 34 - layer * 8);
    }

    // Streamlines: the air it has already come through, all pointing the way
    // it went. Rooted along the blade, never fanned out of a point.
    stroke(WIND.PALE[0], WIND.PALE[1], WIND.PALE[2], 130 * alpha);
    strokeWeight(2.5);
    // `stream`, not `line`: `line` is a p5 global and a loop variable of that
    // name shadows the very function the loop body needs.
    for (const stream of this.lines) {
      const y = stream.at * half;
      line(-stream.lag, y, -stream.lag - stream.length, y * 1.06);
    }
    pop();
  }

  /** One crescent: a parabola bowing forward, drawn across the blade. */
  private bow(offset: number, half: number, depth: number): void {
    beginShape();
    for (let step = 0; step <= 14; step++) {
      const y = -half + (step / 14) * half * 2;
      const x = offset + depth * (1 - Math.pow(y / half, 2));
      vertex(x, y);
    }
    endShape();
  }
}

export default class Temari_Q extends api.Spell {
  /**
   * Left to inference. A fast aimed skillshot that damages is read as
   * `Damage | Poke | Burst`, which is exactly what this is; the push is not a
   * term `scoreSpell` pays for, and a tag it has no term for makes a bot use
   * the ability less than the inference it replaced.
   */
  name = 'Kamaitachi no Jutsu';
  image = api.asset('spell_temari_q');
  description =
    'Một lưỡi gió rộng bay thẳng, <b>xuyên qua tất cả</b> chứ không dừng ở người đầu tiên: ' +
    `${dmg(24, 'MAGIC')} và <span class="buff">thổi bay</span> mỗi ` +
    'người trúng ra xa theo hướng gió.';
  coolDown = Q_COOLDOWN_MS;
  manaCost = Q_CHAKRA;
  targetingMode = 'DIRECTION' as const;
  range = Q_RANGE;

  onSpellCast(): void {
    const gust = new Temari_Q_Gust(this.owner);
    gust.position.set(this.owner.position.x, this.owner.position.y);
    gust.heading = Math.atan2(
      this.aimPoint.y - this.owner.position.y,
      this.aimPoint.x - this.owner.position.x
    );
    this.game.objectManager.addObject(gust);
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
