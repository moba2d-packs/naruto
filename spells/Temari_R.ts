import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { RANGE_BAND, SIGHT, WIND, clamp01, impactSpray, snapOut } from '../spellVfx';
import { dragToward } from './Temari_W';

const QRectangle = api.utils.Quadtree.Rectangle;
const Circle = api.utils.Quadtree.Circle;
const dmgValue = api.text.dmgValue;

/**
 * Kirikiri Mai — the column of wind does not stand still. It walks.
 *
 * The script:
 *
 *   press a direction   → a funnel opens in front of her and sets off
 *   it crosses 650      → slowly, in a straight line, turning as it goes
 *   anyone it reaches   → takes 30 once, and is dragged along inside it
 *   at the far end      → it bursts: 15 more, and everybody in it is thrown
 *                         outward
 *   if it is walked out → of, it takes nobody with it
 *
 * ## A travelling drag, which nothing else here does
 *
 * Her W is a vortex that stays; this is one that *goes somewhere*, and the
 * difference is the whole ability: a stationary pull gathers people where
 * they already were, and a moving one takes them where they did not want to
 * be. It ends by throwing them, so it is a setup rather than a kill — she
 * moves the fight, and somebody else finishes it.
 *
 * ## Slow on purpose
 *
 * The heaviest thing she throws, and the slowest. Gaara's ultimate was
 * rebuilt for exactly this lesson — "instant quá, ko có animation gì bay từ
 * Gaara tới kẻ địch, địch ko né đc" — and the answer was not a travel time
 * bolted on, it was that an ability with no middle has nothing for the art to
 * show and nothing for an enemy to answer. This has a second and a half of
 * middle.
 */
export const R_RANGE = RANGE_BAND.ULTIMATE_LINE;
export const R_RADIUS = 115;
/** Pixels per frame. Deliberately the slowest thing she has. */
export const R_SPEED = 7;
/** Roughly how long it takes to cross its whole range, in milliseconds. */
export const R_TRAVEL_MS = (R_RANGE / R_SPEED) * (1000 / 60);
/** Taken once, the moment it first reaches somebody. */
export const R_CATCH_DAMAGE = 30;
/** And again for everybody still inside when it lets go. */
export const R_BURST_DAMAGE = 15;
export const R_TOTAL_DAMAGE = R_CATCH_DAMAGE + R_BURST_DAMAGE;
/** How far the burst throws, and how long the throw takes. */
export const R_THROW = 160;
export const R_THROW_MS = 260;
/** How far a body is dragged inward per pull while it carries them. */
export const R_PULL = 22;
export const R_PULL_MS = 260;
/** Dissipation: the funnel spins down after it has let go. */
export const R_BURST_MS = 420;
export const R_COOLDOWN_MS = 10_000;
export const R_CHAKRA = 100;

/**
 * The funnel: it walks, it carries, it lets go.
 *
 * Lights the ground it is crossing — it is the one thing she throws that ends
 * up somewhere she is not, and the rule is that you see about as far as you
 * hit. `BLAST` rather than `ZONE` because it is a moving hole in the dark and
 * a wide one.
 */
export class Temari_R_Funnel extends api.SpellObject {
  visionRadius = SIGHT.BLAST;

  heading = 0;

  private ageMs = 0;
  private travelled = 0;
  private burstAtMs: number | null = null;
  /** Caught once for the entry damage; still dragged every frame after. */
  private caught = new Set<AttackableUnit>();

  private mist = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(205, 239, 251, 0.85)',
    0.5
  );

  onAdded(): void {
    this.useParticles(this.mist);
  }

  update(): void {
    this.ageMs += deltaTime;

    if (this.burstAtMs !== null) {
      if (this.ageMs - this.burstAtMs >= R_BURST_MS) this.toRemove = true;
      return;
    }

    const step = R_SPEED * (deltaTime / (1000 / 60));
    this.travelled += step;
    this.position.set(
      this.position.x + Math.cos(this.heading) * step,
      this.position.y + Math.sin(this.heading) * step
    );

    const inside = this.inside();
    for (const victim of inside) {
      if (!this.caught.has(victim)) {
        this.caught.add(victim);
        victim.takeDamage(R_CATCH_DAMAGE, this.owner, 'MAGIC', 'Kirikiri Mai');
        impactSpray(this.mist, victim.position, this.heading, 12, 26, 12);
      }
      dragToward(
        victim,
        this.owner,
        this.position,
        R_PULL,
        R_PULL_MS,
        api.asset('spell_temari_r')
      );
    }

    if (this.travelled >= R_RANGE) this.burst(inside);
  }

  /** Idempotent, like every ending in this pack. */
  private burst(inside: AttackableUnit[]): void {
    if (this.burstAtMs !== null) return;
    this.burstAtMs = this.ageMs;

    for (const victim of inside) {
      victim.takeDamage(R_BURST_DAMAGE, this.owner, 'MAGIC', 'Kirikiri Mai');
      // Thrown **outward**, which is the opposite of everything the funnel
      // was doing a frame ago — and that is the point: the drag ends by
      // letting go, and the picture has to reverse with it.
      const away = Math.atan2(
        victim.position.y - this.position.y,
        victim.position.x - this.position.x
      );
      const thrown = new api.buffs.Dash(R_THROW_MS + 120, this.owner, victim);
      thrown.image = api.asset('spell_temari_r');
      thrown.dashDestination = createVector(
        victim.position.x + Math.cos(away) * R_THROW,
        victim.position.y + Math.sin(away) * R_THROW
      );
      thrown.dashSpeed = (R_THROW / R_THROW_MS) * (1000 / 60);
      thrown.cancelable = false;
      thrown.showTrail = false;
      thrown.buffsToCheckCancel = [];
      victim.addBuff(thrown);
      impactSpray(this.mist, victim.position, away, 12, 28, 13);
    }
  }

  /** True once it has let go. Read by the tests. */
  get spent(): boolean {
    return this.burstAtMs !== null;
  }

  private inside(): AttackableUnit[] {
    return this.game.objectManager.queryObjects({
      area: new Circle({ x: this.position.x, y: this.position.y, r: R_RADIUS }),
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = R_RADIUS + 70;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  draw(): void {
    const bursting = this.burstAtMs === null ? 0 : clamp01((this.ageMs - this.burstAtMs) / R_BURST_MS);
    const alpha = 1 - bursting;
    const opening = clamp01(this.ageMs / 260);
    const size = R_RADIUS * (0.4 + 0.6 * snapOut(opening)) * (1 + bursting * 0.5);
    if (alpha <= 0) return;

    push();
    translate(this.position.x, this.position.y);

    noStroke();
    fill(WIND.PALE[0], WIND.PALE[1], WIND.PALE[2], 20 * alpha);
    circle(0, 0, size * 2);

    // The spiral turns **inward** while it carries and reverses on the burst,
    // because that is what the ability does to a body at each moment. Art
    // that kept spinning inward over an outward throw would be telling the
    // player the opposite of the game.
    const spin = this.ageMs / 180;
    noFill();
    stroke(WIND.EDGE[0], WIND.EDGE[1], WIND.EDGE[2], 225 * alpha);
    // Heavy, because the *turn* is what the ability is. Drawn at four pixels
    // beside three bright rings it came back reading as concentric circles —
    // found in the renderer, where "does this look like it is spinning" is
    // the only place the question can be asked.
    strokeWeight(6.5);
    beginShape();
    for (let step = 0; step <= 120; step++) {
      const t = step / 120;
      const wound = bursting > 0 ? 1 - t : t;
      const at = spin * (bursting > 0 ? -1 : 1) + wound * Math.PI * 5.5;
      const r = size * (1 - wound * 0.86);
      vertex(Math.cos(at) * r, Math.sin(at) * r * 0.82);
    }
    endShape();

    for (let ring = 0; ring < 2; ring++) {
      const r = size * (0.4 + ring * 0.28);
      stroke(WIND.PALE[0], WIND.PALE[1], WIND.PALE[2], (105 - ring * 35) * alpha);
      strokeWeight(2.5);
      ellipse(0, -ring * 10 * snapOut(opening), r * 2, r * 1.6);
    }

    // The rim, on the radius that really catches, and the last thing to go.
    stroke(WIND.EDGE[0], WIND.EDGE[1], WIND.EDGE[2], 240 * alpha);
    strokeWeight(3.5);
    circle(0, 0, R_RADIUS * 2);

    // CLIMAX: the release. A hard ring running outward past the rim, gone in
    // a fifth of a second — the fast element the whole effect otherwise
    // lacks, and the thing that reads as "it let go".
    if (bursting > 0 && bursting < 0.5) {
      const out = bursting / 0.5;
      stroke(WIND.EDGE[0], WIND.EDGE[1], WIND.EDGE[2], 255 * (1 - out));
      strokeWeight(10 * (1 - out));
      circle(0, 0, R_RADIUS * 2 * (1 + out * 0.7));
    }
    pop();
  }
}

export default class Temari_R extends api.Spell {
  /**
   * Told, not inferred. Inference reads an aimed cast as `Damage | Poke |
   * Burst` and stops, which misses what decides when it is worth pressing:
   * the drag is what makes it a setup for somebody else rather than a nuke.
   * All three tags are terms `scoreSpell` pays for.
   */
  static aiRoles =
    api.enums.SpellRole.Damage | api.enums.SpellRole.Cc | api.enums.SpellRole.Burst;

  name = 'Kirikiri Mai';
  image = api.asset('spell_temari_r');
  description =
    'Một cột gió xoáy <b>chạy dọc</b> theo hướng chỉ định. Ai bị nó chạm tới nhận ' +
    `${dmgValue(30, 'MAGIC')} và bị <b>cuốn theo</b>. Tới cuối đường nó vỡ ra: ` +
    `thêm ${dmgValue(15, 'MAGIC')} và <span class="buff">thổi bay</span> tất cả ra ` +
    'ngoài. Nó đi <b>chậm</b> — bước sang bên là thoát.';
  coolDown = R_COOLDOWN_MS;
  manaCost = R_CHAKRA;
  targetingMode = 'DIRECTION' as const;
  range = R_RANGE;

  onSpellCast(): void {
    const funnel = new Temari_R_Funnel(this.owner);
    funnel.position.set(this.owner.position.x, this.owner.position.y);
    funnel.heading = Math.atan2(
      this.aimPoint.y - this.owner.position.y,
      this.aimPoint.x - this.owner.position.x
    );
    this.game.objectManager.addObject(funnel);
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
