import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { clamp01, impactBurst, snapOut, windIn } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;
const Circle = api.utils.Quadtree.Circle;

/**
 * Chakra no Mesu — the same hands, used the other way.
 *
 * The script:
 *
 *   press a direction  → a thin blade of chakra draws itself over her palm
 *   0.11s later        → she cuts, once, in a short arc in front of her
 *   whoever it opens   → takes 10 now and bleeds for a second and a half
 *                      → cannot swing a weapon for 0.9s
 *                      → and every heal they get is worth 40% less for 3s
 *   the blade          → thins out and goes
 *
 * ## Why this is not another slab of broken floor
 *
 * Her Q is 20 plates of pavement and a shove; this is one line, two pixels
 * wide, that opens somebody up. That contrast *is* the champion — a medical
 * ninja knows exactly where to hit, and the two abilities have to look like
 * the two halves of knowing it. The standard's first rule is about champions
 * not sharing a shape, and the same argument applies inside one kit: four
 * buttons that draw the same thing are one button with four cooldowns.
 *
 * ## The debuffs are the reason to press it
 *
 * 25 damage over two seconds is not why this is on an eight-second cooldown.
 * The disarm and the wound are: this is the only ability in the pack that
 * turns a basic-attacking champion off, and the only one that answers
 * somebody else's sustain. Both are things a scan cannot see and a player
 * feels immediately.
 */
export const E_DAMAGE = 10;
/** How far the cut reaches. Melee, like her Q, so deliberately below the band. */
export const E_REACH = 175;
/** Half the swept arc, in radians — a touch under 90° of total. */
export const E_HALF_ANGLE = 0.75;
/** The blade forming on her hand. Short, but it is the only warning there is. */
export const E_WINDUP_MS = 110;
/** The cut itself. */
export const E_SWEEP_MS = 190;
/** Dissipation: the line stays after the blade has gone. */
export const E_FADE_MS = 220;
export const E_BLEED_MS = 1_500;
export const E_BLEED_TICK = 5;
export const E_BLEED_TICK_MS = 500;
/**
 * How many bleed ticks one cut actually lands.
 *
 * Pinned by `tests/Sakura.test.ts` against the buff being *driven*, not
 * derived from the arithmetic: `DamageOverTime` ticks on an accumulator and
 * the buff's own expiry decides whether the last one gets to fire, and those
 * two have disagreed before in this pack. The tooltip quotes this.
 */
export const E_BLEED_TICKS = 3;
export const E_TOTAL_DAMAGE = E_DAMAGE + E_BLEED_TICK * E_BLEED_TICKS;
export const E_DISARM_MS = 900;
export const E_HEAL_CUT = 0.4;
export const E_HEAL_CUT_MS = 3_000;
export const E_COOLDOWN_MS = 8_000;
export const E_CHAKRA = 45;

/**
 * The blade: it forms, it passes, it fades.
 *
 * Rides her body (`attachTo`) rather than standing where she pressed, because
 * it is held in a hand — walking mid-cut drags the arc with her, which is
 * what a swing does.
 *
 * Dark (no `visionRadius`): it never leaves her reach, and she can see her own
 * arm's length.
 */
export class Sakura_E_Scalpel extends api.SpellObject {
  /** The middle of the arc. The cut runs from one edge of it to the other. */
  heading = 0;

  private ageMs = 0;
  /** Where the edge was last frame, so a body is cut when the blade passes it. */
  private lastAngle = -E_HALF_ANGLE;
  /** Multi-hit protection: one cut is one cut, however slow the frame was. */
  private cut = new Set<AttackableUnit>();

  private spray = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(150, 240, 190, 0.85)',
    0.6
  );

  onAdded(): void {
    this.useParticles(this.spray);
  }

  update(): void {
    if (this.dropIfAttachmentLost()) return;
    const hand = this._anchorUnit as AttackableUnit | null;
    if (hand) this.position.set(hand.position.x, hand.position.y);

    const before = this.ageMs;
    this.ageMs += deltaTime;
    if (this.ageMs >= E_WINDUP_MS + E_SWEEP_MS + E_FADE_MS) {
      this.toRemove = true;
      return;
    }
    if (this.ageMs < E_WINDUP_MS) return;

    const from = this.edgeAt(before);
    const to = this.edgeAt(this.ageMs);
    if (to > from) this.sweep(from, to);
    this.lastAngle = to;
  }

  /** Where the blade's edge is at a given age, in radians off `heading`. */
  private edgeAt(ageMs: number): number {
    const t = clamp01((ageMs - E_WINDUP_MS) / E_SWEEP_MS);
    return -E_HALF_ANGLE + snapOut(t) * E_HALF_ANGLE * 2;
  }

  /** Everything the blade passed over between two angles, cut once each. */
  private sweep(from: number, to: number): void {
    const reach = api.combat.Reach.effectiveRange(E_REACH, this.owner);
    const caught = this.game.objectManager.queryObjects({
      area: new Circle({ x: this.position.x, y: this.position.y, r: reach }),
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];

    for (const victim of caught) {
      if (this.cut.has(victim)) continue;
      const dx = victim.position.x - this.position.x;
      const dy = victim.position.y - this.position.y;
      let off = Math.atan2(dy, dx) - this.heading;
      while (off > Math.PI) off -= Math.PI * 2;
      while (off < -Math.PI) off += Math.PI * 2;
      if (off < from || off > to) continue;

      this.cut.add(victim);
      this.open(victim);
    }
  }

  /** The damage, the bleed, the disarm and the wound. In that order. */
  private open(victim: AttackableUnit): void {
    victim.takeDamage(E_DAMAGE, this.owner, 'MAGIC', 'Chakra no Mesu');
    impactBurst(this.spray, victim.position, 8, 16, 9);

    const bleed = new api.buffs.DamageOverTime(E_BLEED_MS, this.owner, victim);
    bleed.damagePerTick = E_BLEED_TICK;
    bleed.tickInterval = E_BLEED_TICK_MS;
    bleed.damageType = 'MAGIC';
    // Green reads as a chakra wound rather than a fire — the class's own
    // header names exactly this recolour.
    bleed.flameColor = [190, 255, 215];
    bleed.emberColor = [30, 120, 80];
    bleed.image = api.asset('spell_sakura_e');
    victim.addBuff(bleed);

    // `Disarm` carries no icon of its own, so the HUD row would say nothing
    // about which ability took the weapon away. The standard requires the
    // override for exactly the four buffs that have no default.
    const disarmed = new api.buffs.Disarm(E_DISARM_MS, this.owner, victim);
    disarmed.image = api.asset('spell_sakura_e');
    victim.addBuff(disarmed);

    const wound = new api.buffs.HealCut(E_HEAL_CUT_MS, this.owner, victim);
    wound.healCut = E_HEAL_CUT;
    wound.image = api.asset('spell_sakura_e');
    victim.addBuff(wound);
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = E_REACH + 40;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  draw(): void {
    push();
    translate(this.position.x, this.position.y);
    rotate(this.heading);

    if (this.ageMs < E_WINDUP_MS) {
      // ANTICIPATION: the blade drawing itself out of her palm, along the
      // line it is about to start from. Nothing else on screen — this is the
      // only frame budget an enemy gets to step back.
      const grow = windIn(clamp01(this.ageMs / E_WINDUP_MS));
      const at = -E_HALF_ANGLE;
      stroke(168, 248, 198, 200 * grow);
      strokeWeight(2 + grow * 2);
      line(
        Math.cos(at) * 22,
        Math.sin(at) * 22,
        Math.cos(at) * (22 + (E_REACH - 22) * grow),
        Math.sin(at) * (22 + (E_REACH - 22) * grow)
      );
      pop();
      return;
    }

    const swept = clamp01((this.ageMs - E_WINDUP_MS) / E_SWEEP_MS);
    const leaving = clamp01((this.ageMs - E_WINDUP_MS - E_SWEEP_MS) / E_FADE_MS);
    const alpha = 1 - leaving;
    const edge = this.lastAngle;

    // CLIMAX and DISSIPATION: the cut it has already made, kept on screen as
    // a thin crescent so the player can see how far the arc actually reached
    // — and the live edge, which is the only bright thing in the effect.
    // Mint, not white. The first shot of this in the real renderer came out
    // as a plain white slash: `(200, 255, 224)` at three pixels reads as
    // white on a dark floor, and the green underlayer was too thin to
    // correct it. The identity of the ability is that it is *chakra* — the
    // same green her palms mend with — so the bright layer has to carry a
    // hue, and the dark one has to be heavy enough to be seen under it.
    noFill();
    stroke(34, 122, 88, 210 * alpha);
    strokeWeight(6);
    this.crescent(-E_HALF_ANGLE, edge, E_REACH);
    stroke(126, 245, 190, 245 * alpha);
    strokeWeight(3);
    this.crescent(-E_HALF_ANGLE, edge, E_REACH * 0.97);

    if (swept < 1) {
      stroke(34, 122, 88, 225);
      strokeWeight(6);
      line(
        Math.cos(edge) * 20,
        Math.sin(edge) * 20,
        Math.cos(edge) * E_REACH,
        Math.sin(edge) * E_REACH
      );
      stroke(150, 255, 205, 255);
      strokeWeight(3);
      line(
        Math.cos(edge) * 20,
        Math.sin(edge) * 20,
        Math.cos(edge) * E_REACH,
        Math.sin(edge) * E_REACH
      );
      noStroke();
      fill(198, 255, 226, 245);
      circle(Math.cos(edge) * E_REACH, Math.sin(edge) * E_REACH, 11);
    }

    pop();
  }

  /** The arc the blade has covered so far, at the radius it really reaches. */
  private crescent(from: number, to: number, radius: number): void {
    beginShape();
    const steps = 14;
    for (let step = 0; step <= steps; step++) {
      const at = from + ((to - from) * step) / steps;
      vertex(Math.cos(at) * radius, Math.sin(at) * radius);
    }
    endShape();
  }
}

export default class Sakura_E extends api.Spell {
  /**
   * Told, not inferred. Inference reads an aimed cast as `Damage | Poke |
   * Burst` and stops, which files 25 damage over two seconds beside a nuke.
   * `Cc` is what the disarm actually is, and it is the term `scoreSpell` pays
   * for — it is why a bot spends this on the champion swinging at it rather
   * than on the one already running away.
   */
  static aiRoles = api.enums.SpellRole.Damage | api.enums.SpellRole.Cc;

  name = 'Chakra no Mesu';
  image = api.asset('spell_sakura_e');
  description =
    'Lưỡi dao chakra quét một đường ngắn trước mặt: <span class="damage magic">10</span> sát ' +
    'thương, chảy máu <span class="damage magic">5</span> mỗi <span class="time">0.5 giây</span> ' +
    'trong <span class="time">1.5 giây</span>, <span class="buff">tước vũ khí</span> ' +
    '<span class="time">0.9 giây</span> và <span class="buff">giảm 40% hồi máu</span> nhận được ' +
    'trong <span class="time">3 giây</span>.';
  coolDown = E_COOLDOWN_MS;
  manaCost = E_CHAKRA;
  targetingMode = 'DIRECTION' as const;
  range = E_REACH;

  onSpellCast(): void {
    const blade = new Sakura_E_Scalpel(this.owner);
    blade.position.set(this.owner.position.x, this.owner.position.y);
    blade.heading = Math.atan2(
      this.aimPoint.y - this.owner.position.y,
      this.aimPoint.x - this.owner.position.x
    );
    // Held in a hand, so it dies with her rather than finishing its swing
    // over a corpse.
    blade.attachTo(this.owner);
    this.game.objectManager.addObject(blade);
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
