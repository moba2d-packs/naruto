import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { KAMUI, RANGE_BAND, SIGHT, clamp01, impactSpray, snapOut, windIn } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;
const Circle = api.utils.Quadtree.Circle;

/**
 * Raikiri — he phases the arm out of the world and puts it through somebody.
 *
 * The script:
 *
 *   press a direction     → he plants his feet and the lightning builds
 *   for 0.9 seconds       → he cannot move, and everybody can see it
 *   then                  → he crosses the gap and drives it through the
 *                           first body in the line
 *   that body             → takes 55 **true** damage — armour and magic
 *                           resistance do not apply, because the arm is not
 *                           in this world
 *   nobody there          → the lightning earths itself and is wasted
 *
 * ## The pack's only true damage, and its only self-root
 *
 * Thirty abilities before this one dealt physical or magic. True damage is
 * the one thing a build cannot answer, so it is priced the way nothing else
 * here is: he is **rooted, visible and telegraphed for nearly a second**
 * before it lands. Both halves are the ability. Take the wind-up off and it
 * is a point-and-click execute; take the true damage off and the wind-up is
 * a cost with nothing on the other side of it.
 *
 * The counterplay is the whole reason the wind-up exists, and it is the same
 * lesson Gaara's ultimate was rebuilt for: *"instant quá, ko có animation gì
 * ... địch ko né đc"*. Walk out of the line, or kill him while he stands
 * there.
 */
export const R_RANGE = RANGE_BAND.ABILITY;
/** How wide the thrust is. Narrow: it is an arm, not a wave. */
export const R_WIDTH = 76;
/** He is rooted for this long, in plain sight, before anything happens. */
export const R_WINDUP_MS = 900;
export const R_DAMAGE = 55;
/** The strike itself, and then the arm coming back. */
export const R_STRIKE_MS = 140;
export const R_FADE_MS = 340;
export const R_COOLDOWN_MS = 10_000;
export const R_CHAKRA = 100;

/**
 * The build, the thrust and the earth: one object, three phases.
 *
 * Rides him while it builds — he is holding it — and it is the *reason* the
 * root is legible: the growing lance is drawn on the ground he is about to
 * cover, so an enemy reads both "he is coming" and "from there to there".
 *
 * Lights where it lands: this is the one thing he throws that ends somewhere
 * he is not standing yet.
 */
export class Kakashi_R_Lance extends api.SpellObject {
  visionRadius = SIGHT.IMPACT;

  heading = 0;

  private ageMs = 0;
  private struck = false;
  /** Seeded once — a bolt that re-rolls its kinks every frame flickers. */
  private kinks: number[] = [];

  private sparks = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(232, 238, 255, 0.9)',
    0.5
  );

  onAdded(): void {
    for (let kink = 0; kink < 5; kink++) this.kinks.push((Math.random() - 0.5) * 26);
    this.useParticles(this.sparks);
  }

  update(): void {
    if (!this.struck) {
      // While it builds it stays on him, so a step — which `CHANNELED`-style
      // rooting prevents anyway — could never leave the picture behind.
      this.position.set(this.owner.position.x, this.owner.position.y);
    }
    this.ageMs += deltaTime;

    if (!this.struck && this.ageMs >= R_WINDUP_MS) this.strike();
    if (this.ageMs >= R_WINDUP_MS + R_STRIKE_MS + R_FADE_MS) this.toRemove = true;
  }

  /** Idempotent: a scene exit and the ordinary clock both arrive here. */
  private strike(): void {
    if (this.struck) return;
    this.struck = true;

    const victim = this.firstInLine();
    if (!victim) return;

    // He crosses the gap with it — the arm goes through them, so he ends up
    // where they are. `moveTo` first, so the engine's own body separation
    // decides the final spot rather than a hand-written one.
    const heading = this.heading;
    const behind = {
      x: victim.position.x - Math.cos(heading) * 40,
      y: victim.position.y - Math.sin(heading) * 40,
    };
    this.owner.moveTo(behind.x, behind.y);
    this.owner.position.set(behind.x, behind.y);
    this.owner.markDisplaced?.();

    // `'TRUE'`, and it is the only one in the pack. `combat/Mitigation.ts`
    // takes nothing off it — which is exactly what the wind-up is paying for.
    victim.takeDamage(R_DAMAGE, this.owner, 'TRUE', 'Raikiri');
    impactSpray(this.sparks, victim.position, heading, 16, 30, 13);
    this.position.set(victim.position.x, victim.position.y);
  }

  /** True once it has landed or missed. Read by the tests. */
  get spent(): boolean {
    return this.struck;
  }

  /**
   * The nearest body inside the lance, and only the nearest.
   *
   * The corridor is the drawn one: `R_WIDTH` across, `R_RANGE` along. One
   * body, because it is a thrust — a true-damage line that hit everybody
   * would be an ultimate with no shape to it.
   */
  private firstInLine(): AttackableUnit | null {
    const from = this.owner.position;
    const alongX = Math.cos(this.heading);
    const alongY = Math.sin(this.heading);

    const candidates = this.game.objectManager.queryObjects({
      area: new Circle({ x: from.x + alongX * (R_RANGE / 2), y: from.y + alongY * (R_RANGE / 2), r: R_RANGE / 2 + R_WIDTH }),
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];

    let nearest: AttackableUnit | null = null;
    let best = Infinity;
    for (const unit of candidates) {
      const dx = unit.position.x - from.x;
      const dy = unit.position.y - from.y;
      const along = dx * alongX + dy * alongY;
      if (along < 0 || along > R_RANGE) continue;
      if (Math.abs(-dx * alongY + dy * alongX) > R_WIDTH / 2) continue;
      if (along < best) {
        best = along;
        nearest = unit;
      }
    }
    return nearest;
  }

  getDisplayBoundingBox(): Rectangle {
    const tipX = this.position.x + Math.cos(this.heading) * R_RANGE;
    const tipY = this.position.y + Math.sin(this.heading) * R_RANGE;
    const pad = R_WIDTH + 40;
    return new QRectangle({
      x: Math.min(this.position.x, tipX) - pad,
      y: Math.min(this.position.y, tipY) - pad,
      w: Math.abs(tipX - this.position.x) + pad * 2,
      h: Math.abs(tipY - this.position.y) + pad * 2,
      data: this,
    });
  }

  draw(): void {
    push();
    translate(this.position.x, this.position.y);
    rotate(this.heading);

    if (!this.struck) {
      // ANTICIPATION, and it is most of the ability. The corridor is drawn on
      // the ground from the first frame at the width the strike really uses,
      // and it *fills* as the second runs down — so "how long have I got" and
      // "where do I have to not be" are the same picture.
      const charge = clamp01(this.ageMs / R_WINDUP_MS);
      const half = R_WIDTH / 2;

      noStroke();
      fill(KAMUI.EDGE[0], KAMUI.EDGE[1], KAMUI.EDGE[2], 30 + 34 * charge);
      rect(0, -half, R_RANGE, R_WIDTH);
      noFill();
      stroke(KAMUI.EDGE[0], KAMUI.EDGE[1], KAMUI.EDGE[2], 200);
      strokeWeight(2.5);
      line(0, -half, R_RANGE, -half);
      line(0, half, R_RANGE, half);
      // The filling half: how much of the second is gone.
      noStroke();
      fill(KAMUI.SPARK[0], KAMUI.SPARK[1], KAMUI.SPARK[2], 60);
      rect(0, -half, R_RANGE * windIn(charge), R_WIDTH);

      // The lightning gathering on the arm — small, and growing hard.
      stroke(KAMUI.SPARK[0], KAMUI.SPARK[1], KAMUI.SPARK[2], 255);
      strokeWeight(2 + 3 * charge);
      this.bolt(70 * charge, charge);
      pop();
      return;
    }

    // CLIMAX and DISSIPATION: the arm has gone through, and what is left is
    // the line it took, earthing itself.
    const after = clamp01((this.ageMs - R_WINDUP_MS) / (R_STRIKE_MS + R_FADE_MS));
    const alpha = 1 - snapOut(after);
    if (alpha <= 0) {
      pop();
      return;
    }
    stroke(KAMUI.EDGE[0], KAMUI.EDGE[1], KAMUI.EDGE[2], 200 * alpha);
    strokeWeight(12 * alpha);
    this.bolt(120, 1);
    stroke(KAMUI.SPARK[0], KAMUI.SPARK[1], KAMUI.SPARK[2], 255 * alpha);
    strokeWeight(4 * alpha);
    this.bolt(120, 1);
    pop();
  }

  /** A kinked bolt: lightning is saved from reading as a spike by never being straight. */
  private bolt(length: number, spread: number): void {
    beginShape();
    vertex(0, 0);
    for (let joint = 0; joint < this.kinks.length; joint++) {
      const along = ((joint + 1) / (this.kinks.length + 1)) * length;
      vertex(along, this.kinks[joint] * spread);
    }
    vertex(length, 0);
    endShape();
  }
}

export default class Kakashi_R extends api.Spell {
  /**
   * Told, not inferred. Inference reads an aimed cast as `Damage | Poke |
   * Burst`, and `Poke` is the wrong half of that: nothing about a
   * nine-tenths-of-a-second self-root is poke. `Burst` is what lifts it above
   * an ordinary skillshot in `scoreSpell`, and both tags are terms the scorer
   * actually pays for.
   */
  static aiRoles = api.enums.SpellRole.Damage | api.enums.SpellRole.Burst;

  name = 'Raikiri';
  image = api.asset('spell_kakashi_r');
  description =
    'Kakashi <b>đứng yên</b> tích sét trong <span class="time">0.9 giây</span> — ai cũng thấy — ' +
    'rồi lao xuyên qua người đầu tiên trong vệt: <span class="damage true">55 sát thương ' +
    'chuẩn</span>, giáp và kháng phép đều vô nghĩa. Đây là sát thương chuẩn <b>duy nhất</b> của ' +
    'pack, và cái giá của nó là gần một giây đứng phơi ra đó.';
  coolDown = R_COOLDOWN_MS;
  manaCost = R_CHAKRA;
  targetingMode = 'DIRECTION' as const;
  range = R_RANGE;

  onSpellCast(): void {
    const lance = new Kakashi_R_Lance(this.owner);
    lance.position.set(this.owner.position.x, this.owner.position.y);
    lance.heading = Math.atan2(
      this.aimPoint.y - this.owner.position.y,
      this.aimPoint.x - this.owner.position.x
    );
    this.game.objectManager.addObject(lance);

    // The price, and it is applied to himself. `Root` rather than a channel
    // because the lightning is already out of his hands the moment it starts
    // building — the object owns the clock, and a channel that could be
    // silenced away would refund a cost he has already paid.
    const planted = new api.buffs.Root(R_WINDUP_MS, this.owner, this.owner);
    planted.image = this.image;
    planted.buffAddType = api.enums.BuffAddType.RENEW_EXISTING;
    this.owner.addBuff(planted);
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
