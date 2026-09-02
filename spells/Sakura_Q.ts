import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { clamp01, impactSpray, snapOut, windIn } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;
const Circle = api.utils.Quadtree.Circle;

/**
 * Shannarō — she plants her feet and puts a fist through the floor.
 *
 * The script:
 *
 *   press a direction     → the pavement in front of her starts to craze
 *   0.22s later           → it breaks: slabs come up out of their own pits
 *   whoever is standing   → takes 22, and is thrown back off her
 *   over the next 0.5s    → the slabs drop back and the dust settles
 *
 * ## Why the tell is on the ground and not on her
 *
 * A 0.22s wind-up drawn on the champion is a wind-up only the person holding
 * the champion can see. Drawn on the floor it is a *place*, which is what an
 * enemy has to leave — and it is the same place the damage lands, so the
 * warning and the hitbox cannot drift apart. That is the reason the wedge is
 * fixed at the moment of the press: she may walk out of her own punch, and
 * so may the victim.
 *
 * ## The shove is the ability
 *
 * She is melee, she has no dash out, and her whole job is standing in front
 * of somebody else. 22 damage on a six-second cooldown is not what this is
 * for — the 170 units of "get off me" is. It is also the only knock-back in
 * this pack; Gaara's shield throws people *up*, which reads and plays
 * differently.
 */
export const Q_DAMAGE = 22;
/** How far the wedge reaches from her centre. Melee, so below the band. */
export const Q_LENGTH = 200;
/** Half the wedge, in radians — a touch over 60° of total spread. */
export const Q_HALF_ANGLE = 0.55;
/** The warning. Short, because it is a punch and not a siege engine. */
export const Q_TELL_MS = 220;
/** How far a caught body is thrown, and how long the throw takes. */
export const Q_SHOVE = 170;
export const Q_SHOVE_MS = 260;
/** Dissipation: the slabs drop back rather than blinking out. */
export const Q_SETTLE_MS = 520;
/**
 * The shockwave that races out of the fist, and the overshoot on the slabs.
 *
 * These two are the whole answer to "ko có tý vật lý nào ... chỉ thấy hình
 * quạt hiện lên rồi đẩy+gây damage". A wedge that simply appears at full size
 * has no *force* in it: nothing accelerates, nothing overshoots, nothing
 * leaves. The standard's own words are that linear motion is what makes an
 * effect look like a placeholder — and no motion at all is worse.
 */
export const Q_SHOCK_MS = 200;
export const Q_PUNCH_MS = 150;
export const Q_COOLDOWN_MS = 6_000;
export const Q_CHAKRA = 40;

/** Bands of pavement out from the fist, and slabs across the wedge in each. */
const RINGS = 4;
const CELLS = 5;

/**
 * The broken floor: the warning, the break and the settle, in one object.
 *
 * One object because they are one event seen three times. Splitting the tell
 * from the break would leave a frame with neither on screen, and the standard
 * is explicit that a hand-off has to overlap or it reads as a pop.
 *
 * Deliberately dark (no `visionRadius`): the wedge starts at her own feet and
 * reaches 200, which is ground she can already see. A radius here would be a
 * champion who scouts by punching the floor.
 */
export class Sakura_Q_Fissure extends api.SpellObject {
  /** Where the punch points. Fixed at the press — see the header. */
  heading = 0;

  private ageMs = 0;
  private struck = false;
  /** Per-slab, seeded once: a slab that re-rolls its height every frame flickers. */
  private slabs: { lift: number; nudge: number; shade: number }[] = [];

  private dust = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(196, 170, 122, 0.85)',
    0.5
  );

  onAdded(): void {
    for (let ring = 0; ring < RINGS; ring++) {
      for (let cell = 0; cell < CELLS; cell++) {
        // The far end of the wedge goes furthest: the floor is being pushed
        // away from her, which is the same thing the shove does to a body.
        const forward = 0.35 + 0.65 * (ring / (RINGS - 1));
        this.slabs.push({
          lift: (7 + Math.random() * 12) * forward,
          nudge: (5 + Math.random() * 7) * forward,
          shade: 0.6 + 0.4 * ((ring + cell) % 2),
        });
      }
    }
    this.useParticles(this.dust);
  }

  update(): void {
    this.ageMs += deltaTime;
    if (!this.struck && this.ageMs >= Q_TELL_MS) this.strike();
    if (this.ageMs >= Q_TELL_MS + Q_SETTLE_MS) this.toRemove = true;
  }

  /**
   * Idempotent, like every other ending in this pack: a scene exit and the
   * ordinary clock can arrive here in the same frame.
   */
  private strike(): void {
    if (this.struck) return;
    this.struck = true;

    const reach = api.combat.Reach.effectiveRange(Q_LENGTH, this.owner);
    const caught = this.game.objectManager.queryObjects({
      area: new Circle({ x: this.position.x, y: this.position.y, r: reach }),
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];

    for (const victim of caught) {
      if (!this.inWedge(victim)) continue;
      victim.takeDamage(Q_DAMAGE, this.owner, 'PHYSICAL', 'Shannarō');
      // Thrown the way the punch went, not out in a ring: it is the same
      // direction the body itself is about to travel, and grit that sprays
      // backwards over a forward shove is the picture contradicting the game.
      impactSpray(this.dust, victim.position, this.heading, 12, 26, 12);
      this.shove(victim);
    }

    // And the floor itself throws grit, all the way down the wedge — the
    // ability is the ground breaking, so the ground is what has to move.
    for (let step = 0; step < 5; step++) {
      const at = Q_LENGTH * (0.2 + step * 0.18);
      const off = (Math.random() - 0.5) * Q_HALF_ANGLE * 1.6;
      impactSpray(
        this.dust,
        {
          x: this.position.x + Math.cos(this.heading + off) * at,
          y: this.position.y + Math.sin(this.heading + off) * at,
        },
        this.heading,
        3,
        22,
        9
      );
    }
  }

  /** The wedge is the hitbox and the drawing both. One rule, one region. */
  private inWedge(victim: AttackableUnit): boolean {
    const dx = victim.position.x - this.position.x;
    const dy = victim.position.y - this.position.y;
    if (dx === 0 && dy === 0) return true;
    let off = Math.atan2(dy, dx) - this.heading;
    while (off > Math.PI) off -= Math.PI * 2;
    while (off < -Math.PI) off += Math.PI * 2;
    return Math.abs(off) <= Q_HALF_ANGLE;
  }

  /**
   * Thrown straight away from her, not away from the wedge's centre line: the
   * punch is what moved them, and a body shoved sideways off an axis it was
   * never on reads as the game disagreeing with the picture.
   */
  private shove(victim: AttackableUnit): void {
    const dx = victim.position.x - this.position.x;
    const dy = victim.position.y - this.position.y;
    const gap = Math.hypot(dx, dy);
    const awayX = gap < 1 ? Math.cos(this.heading) : dx / gap;
    const awayY = gap < 1 ? Math.sin(this.heading) : dy / gap;

    const thrown = new api.buffs.Dash(Q_SHOVE_MS + 120, this.owner, victim);
    thrown.image = api.asset('spell_sakura_q');
    thrown.dashDestination = createVector(
      victim.position.x + awayX * Q_SHOVE,
      victim.position.y + awayY * Q_SHOVE
    );
    thrown.dashSpeed = (Q_SHOVE / Q_SHOVE_MS) * (1000 / 60);
    thrown.cancelable = false;
    thrown.showTrail = false;
    // A displacement somebody else applied is not cancelled by crowd control
    // the thrower also applied — see `Dash.buffsToCheckCancel`'s own note.
    thrown.buffsToCheckCancel = [];
    victim.addBuff(thrown);
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = Q_LENGTH + 40;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  draw(): void {
    // One normalized progress per phase, each with its own ease. `rise` is
    // how far out of the floor the slabs are: nothing before the break, all
    // the way up on the frame it lands, and most of the way back by the end.
    const before = clamp01(this.ageMs / Q_TELL_MS);
    const after = clamp01((this.ageMs - Q_TELL_MS) / Q_SETTLE_MS);
    // The slabs come up *past* where they settle and drop back into it. A
    // shape that arrives at its final size is a shape with no weight in it;
    // the overshoot is the whole difference between "the floor broke" and "a
    // wedge appeared".
    const punch = clamp01((this.ageMs - Q_TELL_MS) / Q_PUNCH_MS);
    const overshoot = this.struck ? 1 + 0.5 * (1 - snapOut(punch)) : 1;
    const rise = this.struck ? (1 - snapOut(after) * 0.78) * overshoot : 0;
    const alpha = this.struck ? 1 - after * 0.85 : 0.3 + 0.35 * windIn(before);
    // Before the strike the crazing *races* out from her fist rather than
    // fading in everywhere at once: a tell with a direction is a tell that
    // says which way to run.
    const front = this.struck ? Q_LENGTH : snapOut(before) * Q_LENGTH;

    push();
    translate(this.position.x, this.position.y);
    rotate(this.heading);

    // The true edge of the damage, drawn whatever the slabs are doing. The
    // slabs overhang it once they are up — that is what a rim is for.
    //
    // Built from vertices rather than `arc(..., PIE)`: `PIE` is one of the p5
    // constants the test harness does not stub, so a spell that reaches for
    // it works in a match and dies with "PIE is not defined" in every test
    // that drives it. `beginShape`/`vertex` are stubbed and say the same
    // thing.
    noStroke();
    fill(201, 168, 111, 26 * alpha);
    this.wedge();
    noFill();
    stroke(107, 79, 42, 230 * alpha);
    strokeWeight(3);
    this.wedge();

    // Pass one: the pits — but only as far as the crack has actually run.
    // Every one of them before any slab, or a slab is drawn over a hole that
    // has not been dug yet.
    noStroke();
    fill(22, 17, 10, 255 * (0.25 + 0.6 * rise) * alpha);
    this.eachCell((points, ring) => {
      if (this.beyondFront(ring, front)) return;
      this.plate(points, 0, 0);
    });

    // Pass two: the slabs, lifted out. Screen-up plus a nudge along their own
    // radius — all leaning the same way, which is the way the punch went.
    let index = 0;
    strokeWeight(2);
    this.eachCell((points, ring, cell) => {
      const slab = this.slabs[index++] ?? { lift: 8, nudge: 6, shade: 1 };
      if (this.beyondFront(ring, front)) return;
      const mid = -Q_HALF_ANGLE + ((cell + 0.5) / CELLS) * Q_HALF_ANGLE * 2;
      stroke(59, 42, 20, 240 * alpha);
      fill(185, 154, 99, 255 * slab.shade * alpha);
      this.plate(
        points,
        Math.cos(mid) * slab.nudge * rise,
        Math.sin(mid) * slab.nudge * rise - slab.lift * rise
      );
    });

    // CLIMAX: the blow itself, and the only fast thing on screen. A hard arc
    // leaves the fist and runs out past the rim in a fifth of a second, with
    // a white flash at the knuckle on the frame it lands. This is what a
    // player reads as force — the slabs are the *aftermath* of it, and an
    // aftermath with nothing in front of it is what "phèn" means.
    const shock = clamp01((this.ageMs - Q_TELL_MS) / Q_SHOCK_MS);
    if (this.struck && shock < 1) {
      const out = snapOut(shock);
      const gone = 1 - shock;
      noFill();
      stroke(255, 238, 214, 255 * gone);
      strokeWeight(11 * gone);
      this.frontArc(Q_LENGTH * (0.12 + out * 1.15));
      stroke(196, 158, 104, 200 * gone);
      strokeWeight(5 * gone);
      this.frontArc(Q_LENGTH * (0.12 + out * 1.15) * 0.82);

      noStroke();
      fill(255, 246, 232, 235 * gone * gone);
      circle(0, 0, 46 * gone);
    }
    pop();
  }

  /** Whether a band of pavement is still ahead of the running crack. */
  private beyondFront(ring: number, front: number): boolean {
    return (Q_LENGTH * ring) / RINGS > front;
  }

  /** An open arc across the wedge, at one radius. The shockwave rides this. */
  private frontArc(radius: number): void {
    beginShape();
    for (let step = 0; step <= 12; step++) {
      const at = -Q_HALF_ANGLE + (step / 12) * Q_HALF_ANGLE * 2;
      vertex(Math.cos(at) * radius, Math.sin(at) * radius);
    }
    endShape();
  }

  /** The pie slice the damage actually uses: apex, far arc, back to apex. */
  private wedge(): void {
    beginShape();
    vertex(0, 0);
    for (let step = 0; step <= 12; step++) {
      const at = -Q_HALF_ANGLE + (step / 12) * Q_HALF_ANGLE * 2;
      vertex(Math.cos(at) * Q_LENGTH, Math.sin(at) * Q_LENGTH);
    }
    endShape(CLOSE);
  }

  /** The wedge, cut into `RINGS × CELLS` slabs of pavement. */
  private eachCell(
    body: (points: [number, number][], ring: number, cell: number) => void
  ): void {
    for (let ring = 0; ring < RINGS; ring++) {
      const near = Q_LENGTH * (ring / RINGS);
      const far = Q_LENGTH * ((ring + 1) / RINGS);
      const gap = 4;
      const inset = gap / Math.max(far, 1);
      for (let cell = 0; cell < CELLS; cell++) {
        const a0 = -Q_HALF_ANGLE + (cell / CELLS) * Q_HALF_ANGLE * 2 + inset;
        const a1 = -Q_HALF_ANGLE + ((cell + 1) / CELLS) * Q_HALF_ANGLE * 2 - inset;
        body(
          [
            [Math.cos(a0) * (near + gap), Math.sin(a0) * (near + gap)],
            [Math.cos(a1) * (near + gap), Math.sin(a1) * (near + gap)],
            [Math.cos(a1) * (far - gap), Math.sin(a1) * (far - gap)],
            [Math.cos(a0) * (far - gap), Math.sin(a0) * (far - gap)],
          ],
          ring,
          cell
        );
      }
    }
  }

  private plate(points: [number, number][], dx: number, dy: number): void {
    beginShape();
    for (const [x, y] of points) vertex(x + dx, y + dy);
    endShape(CLOSE);
  }
}

export default class Sakura_Q extends api.Spell {
  /**
   * Left to inference on purpose. A short aimed cast that damages is read as
   * `Damage | Poke | Burst`, which is what this is; the knock-back is not a
   * role `scoreSpell` has a term for, and this pack has already been burned
   * once by a hand-written tag the scorer pays nothing for.
   */
  name = 'Shannarō';
  image = api.asset('spell_sakura_q');
  description =
    'Sakura nện nắm đấm xuống đất. Sau <span class="time">0.22 giây</span>, cả mảng nền ' +
    'trước mặt <b>vỡ tung</b>: <span class="damage physical">22</span> sát thương và ' +
    '<span class="buff">hất văng</span> kẻ địch ra xa. Vết nứt hiện ra trước — đứng yên là dính.';
  coolDown = Q_COOLDOWN_MS;
  manaCost = Q_CHAKRA;
  targetingMode = 'DIRECTION' as const;
  range = Q_LENGTH;

  onSpellCast(): void {
    const fissure = new Sakura_Q_Fissure(this.owner);
    fissure.position.set(this.owner.position.x, this.owner.position.y);
    fissure.heading = Math.atan2(
      this.aimPoint.y - this.owner.position.y,
      this.aimPoint.x - this.owner.position.x
    );
    this.game.objectManager.addObject(fissure);
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
