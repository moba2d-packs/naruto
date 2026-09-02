import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { SIGHT, clamp01, impactBurst, snapOut } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;
const Circle = api.utils.Quadtree.Circle;

/**
 * The hole her fist leaves, and the rubble that stays in it.
 *
 *   the frame it lands  → everything inside 175 takes 48
 *   for 3.5 seconds     → the broken ground slows whoever stands in it
 *   the last second     → the floor settles and the rubble goes flat
 *
 * ## One radius, one rule
 *
 * The blast and the rubble cover exactly the same circle on purpose. The
 * standard says every zone that behaves differently has to *look* different;
 * the other half of that is that a zone which behaves one way must not be
 * drawn as two, so there is a single rim here and it is the number both the
 * damage and the slow use.
 *
 * ## It is dust, not a hole
 *
 * The first version filled this with near-black at 0.7 alpha, which read as a
 * void punched through the map and — worse — hid everybody standing in the
 * zone it exists to mark. Churned ground is *lighter* than the floor, and
 * only the bowl directly under the fist is darker. Found in
 * `tools/preview-shape.mjs` before a line of it was ported, which is the
 * whole reason that tool exists.
 */
export const CRATER_DAMAGE = 48;
export const CRATER_RADIUS = 175;
export const CRATER_RUBBLE_MS = 3_500;
/** The last stretch of the rubble, during which the floor settles back. */
export const CRATER_SINK_MS = 900;
export const CRATER_SLOW = 0.35;
/** Re-applied every frame a body is inside, so the buff clock is the zone. */
export const CRATER_SLOW_MS = 400;

const CHUNKS = 14;
const FISSURES = 7;

export class Sakura_R_Crater extends api.SpellObject {
  /**
   * An ultimate-scale hole in the dark. The blast is the one thing in this
   * kit that lands somewhere she was not standing a moment ago, so it is the
   * one thing that has ground of its own to show.
   */
  visionRadius = SIGHT.BLAST;

  private ageMs = 0;
  private blasted = false;
  private chunks: { at: number; along: number; across: number }[] = [];
  private fissures: number[] = [];

  private dust = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(206, 182, 133, 0.9)',
    0.42
  );

  onAdded(): void {
    for (let chunk = 0; chunk < CHUNKS; chunk++) {
      this.chunks.push({
        at: (chunk / CHUNKS) * Math.PI * 2 + Math.random() * 0.18,
        along: 16 + Math.random() * 16,
        across: 9 + Math.random() * 13,
      });
    }
    for (let crack = 0; crack < FISSURES; crack++) {
      this.fissures.push((crack / FISSURES) * Math.PI * 2 + Math.random() * 0.3);
    }
    this.useParticles(this.dust);
  }

  update(): void {
    this.ageMs += deltaTime;
    if (!this.blasted) this.blast();

    if (this.ageMs >= CRATER_RUBBLE_MS) {
      this.toRemove = true;
      return;
    }
    // The rubble keeps working right up to the moment it goes flat. A zone
    // that stopped applying its slow while still drawn would be the effect
    // lying about itself, which the standard rates worse than missing.
    for (const caught of this.inside()) {
      const slowed = new api.buffs.Slow(CRATER_SLOW_MS, this.owner, caught);
      slowed.percent = CRATER_SLOW;
      slowed.image = api.asset('spell_sakura_r');
      // `Slow` stacks ten deep by default, so a zone that re-applies every
      // frame turns 35% into a standstill. One slow, its clock rewound.
      slowed.buffAddType = api.enums.BuffAddType.RENEW_EXISTING;
      caught.addBuff(slowed);
    }
  }

  /** Idempotent: a scene exit and the ordinary clock can both arrive here. */
  private blast(): void {
    if (this.blasted) return;
    this.blasted = true;
    for (const victim of this.inside()) {
      victim.takeDamage(CRATER_DAMAGE, this.owner, 'PHYSICAL', 'Ōkashō');
      impactBurst(this.dust, victim.position, 12, 24, 13);
    }
  }

  private inside(): AttackableUnit[] {
    return this.game.objectManager.queryObjects({
      area: new Circle({ x: this.position.x, y: this.position.y, r: CRATER_RADIUS }),
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = CRATER_RADIUS + 60;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  draw(): void {
    const settling = clamp01(
      (this.ageMs - (CRATER_RUBBLE_MS - CRATER_SINK_MS)) / CRATER_SINK_MS
    );
    // How far out of the floor the rubble is: all the way up while the zone
    // is live, flat by the time it ends.
    const rubble = 1 - snapOut(settling);
    const alpha = 1 - settling * 0.9;
    const centre = this.position;

    push();
    translate(centre.x, centre.y);
    noStroke();

    // Churned ground: lighter than the map. Bodies standing in it stay
    // readable, which is the whole point of drawing the zone.
    fill(201, 168, 111, 255 * (0.1 + 0.14 * rubble) * alpha);
    circle(0, 0, CRATER_RADIUS * 2 * 0.96);
    // The bowl under the fist is the only part darker than the floor.
    fill(58, 44, 23, 255 * 0.3 * rubble * alpha);
    circle(0, 0, CRATER_RADIUS * 2 * 0.34);

    // Fissures running out of the impact point — they stop AT the rim, so
    // the longest one is never read as the reach.
    noFill();
    stroke(74, 52, 24, 216 * rubble * alpha);
    strokeWeight(3 + 3 * rubble);
    for (const at of this.fissures) {
      beginShape();
      for (let step = 0; step <= 5; step++) {
        const t = step / 5;
        const wob = Math.sin(t * 6 + at) * 9 * t;
        const r = CRATER_RADIUS * 0.94 * t;
        vertex(Math.cos(at) * r - Math.sin(at) * wob, Math.sin(at) * r + Math.cos(at) * wob);
      }
      endShape();
    }

    // The rubble ring: chunks rooted ON the rim, astride it, rather than
    // radiating from the middle. Rooted at a point and fanned outward is what
    // turned an arm into a club and a grip into a starburst; rooted along a
    // line it stays a ring of debris.
    strokeWeight(2);
    stroke(59, 42, 20, 240 * rubble * alpha);
    fill(185, 154, 99, 230 * rubble * alpha);
    for (const chunk of this.chunks) {
      const ca = Math.cos(chunk.at);
      const sa = Math.sin(chunk.at);
      const tx = -sa;
      const ty = ca;
      const across = chunk.across * rubble;
      const inner = CRATER_RADIUS - across * 0.55;
      const outer = CRATER_RADIUS + across * 0.45;
      const half = chunk.along / 2;
      beginShape();
      vertex(ca * inner - tx * half, sa * inner - ty * half);
      vertex(ca * inner + tx * half, sa * inner + ty * half);
      vertex(ca * outer + tx * chunk.along * 0.32, sa * outer + ty * chunk.along * 0.32);
      vertex(ca * outer - tx * chunk.along * 0.38, sa * outer - ty * chunk.along * 0.38);
      endShape(CLOSE);
    }

    // The rim, on the radius the damage and the slow both use. Last thing to
    // go, so the next press is aimed by something true.
    noFill();
    stroke(107, 79, 42, 242 * alpha);
    strokeWeight(3.5);
    circle(0, 0, CRATER_RADIUS * 2);

    // CLIMAX: the shockwave, and only in the first fifth of a second. It runs
    // outward past the rim, which is what the landing just did to the floor.
    const shock = clamp01(this.ageMs / 260);
    if (shock < 1) {
      stroke(255, 233, 201, 255 * (1 - shock));
      strokeWeight(9 * (1 - shock));
      circle(0, 0, CRATER_RADIUS * 2 * (0.3 + shock * 1.05));
    }

    // Her mark at the point of impact — the same rhombus the mend draws on an
    // ally, so a crater says who made it.
    noFill();
    stroke(228, 106, 140, 235 * alpha);
    strokeWeight(3);
    const mark = 26;
    beginShape();
    vertex(0, -mark);
    vertex(mark * 0.62, 0);
    vertex(0, mark);
    vertex(-mark * 0.62, 0);
    endShape(CLOSE);

    pop();
  }
}
