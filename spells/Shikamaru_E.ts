import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { RANGE_BAND, SHADOW, SIGHT, clamp01, impactSpray, windIn } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;
const Circle = api.utils.Quadtree.Circle;
const dmg = api.text.dmg;

/**
 * Kage Kubi Shibari — a hand comes up out of somebody's own shadow and takes
 * them by the throat.
 *
 * The script:
 *
 *   press a point           → the ground there darkens, and fingers show
 *   0.35s later             → the hand closes: 18, and they cannot cast
 *   for 1.4 seconds         → silenced
 *   the hand                → sinks back into the floor
 *
 * ## The only silence in the pack
 *
 * Every other champion here answers a fight by removing health or by moving
 * bodies. This answers it by taking a *button* away, which is a different
 * kind of question and the reason he is worth a slot: a form he can turn off,
 * an ultimate he can stop, a heal he can refuse. It is aimed at the ground
 * rather than at a body on purpose — a point-and-click silence is not a play,
 * it is a tax.
 *
 * ## Why it is a hand and not a circle
 *
 * His Q lies flat, his W stitches up, his R spreads. Four shadow abilities
 * that all draw a dark patch would be one ability with four cooldowns — the
 * standard's first rule, applied inside a kit. This one *closes*, and it is
 * the only thing in the pack that draws fingers.
 */
export const E_RANGE = RANGE_BAND.ABILITY;
export const E_RADIUS = 110;
/** The tell. Long enough to leave, short enough to land on somebody held. */
export const E_TELL_MS = 350;
export const E_DAMAGE = 18;
export const E_SILENCE_MS = 1_400;
/** Dissipation: the hand sinks rather than blinking out. */
export const E_SINK_MS = 480;
export const E_COOLDOWN_MS = 10_000;
export const E_CHAKRA = 55;

const FINGERS = 5;

/**
 * The hand: shown, closed, sunk.
 *
 * This one *does* light the ground it landed on — unlike the rest of his kit
 * it is thrown somewhere he is not, and the standard's rule is that you see
 * about as far as you hit.
 */
export class Shikamaru_E_Grasp extends api.SpellObject {
  visionRadius = SIGHT.IMPACT;

  private ageMs = 0;
  private closed = false;
  /** Seeded once, so the fingers do not rewrite themselves every frame. */
  private fingers: { at: number; spread: number; length: number }[] = [];

  private dark = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(140, 112, 220, 0.85)',
    0.45
  );

  onAdded(): void {
    for (let finger = 0; finger < FINGERS; finger++) {
      // A hand, not a starburst: the fingers sit in a **fan of about 120°**
      // rooted on one wrist, all leaning the same way. Rooted at a point and
      // spread over the full circle they would be a mace, which is the
      // failure this pack has now paid for three times.
      const spread = -1.05 + (finger / (FINGERS - 1)) * 2.1;
      this.fingers.push({
        at: spread,
        spread,
        length: E_RADIUS * (0.7 + Math.random() * 0.2),
      });
    }
    this.useParticles(this.dark);
  }

  update(): void {
    this.ageMs += deltaTime;
    if (!this.closed && this.ageMs >= E_TELL_MS) this.close();
    if (this.ageMs >= E_TELL_MS + E_SINK_MS) this.toRemove = true;
  }

  /** Idempotent, like every ending in this pack. */
  private close(): void {
    if (this.closed) return;
    this.closed = true;

    const caught = this.game.objectManager.queryObjects({
      area: new Circle({ x: this.position.x, y: this.position.y, r: E_RADIUS }),
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];

    for (const victim of caught) {
      victim.takeDamage(E_DAMAGE, this.owner, 'MAGIC', 'Kage Kubi Shibari');
      // Inward, toward the wrist: the hand closed *on* them, and grit flying
      // outward over an inward grip is the art contradicting the game.
      const inward = Math.atan2(
        this.position.y - victim.position.y,
        this.position.x - victim.position.x
      );
      impactSpray(this.dark, victim.position, inward, 9, 20, 10);

      const hushed = new api.buffs.Silence(E_SILENCE_MS, this.owner, victim);
      hushed.image = api.asset('spell_shikamaru_e');
      victim.addBuff(hushed);
    }
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = E_RADIUS + 40;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  draw(): void {
    const opening = clamp01(this.ageMs / E_TELL_MS);
    const sinking = this.closed ? clamp01((this.ageMs - E_TELL_MS) / E_SINK_MS) : 0;
    const alpha = 1 - sinking * 0.85;
    // Open while it waits, shut on the frame it lands, then relaxing as it
    // goes down. The *closing* is the climax, and it is one number.
    const grip = this.closed ? 1 - sinking * 0.4 : windIn(opening) * 0.35;

    push();
    translate(this.position.x, this.position.y);

    // The palm on the floor, at the radius the damage really uses.
    noStroke();
    fill(SHADOW.BODY[0], SHADOW.BODY[1], SHADOW.BODY[2], 190 * alpha * (0.4 + 0.6 * opening));
    circle(0, 0, E_RADIUS * 2 * 0.5);
    noFill();
    stroke(SHADOW.RIM[0], SHADOW.RIM[1], SHADOW.RIM[2], 225 * alpha);
    strokeWeight(3);
    circle(0, 0, E_RADIUS * 2);

    // Rims first, then bodies. Per-finger rim-then-body paints each rim over
    // the last finger's dark half and the hand comes out solid violet.
    stroke(SHADOW.RIM[0], SHADOW.RIM[1], SHADOW.RIM[2], 240 * alpha);
    strokeWeight(11);
    for (const finger of this.fingers) this.finger(finger, grip);
    stroke(SHADOW.BODY[0], SHADOW.BODY[1], SHADOW.BODY[2], 250 * alpha);
    strokeWeight(6);
    for (const finger of this.fingers) this.finger(finger, grip);

    // CLIMAX: the snap. A hard ring collapsing *inward* on the frame it
    // closes — inward, because that is the direction the hand went.
    if (this.closed && sinking < 0.35) {
      const snap = clamp01(sinking / 0.35);
      noFill();
      stroke(226, 214, 255, 255 * (1 - snap));
      strokeWeight(8 * (1 - snap));
      circle(0, 0, E_RADIUS * 2 * (1.25 - snap * 0.85));
    }
    pop();
  }

  /**
   * One finger: rooted at the wrist, curling in as the grip closes.
   *
   * Drawn as a two-segment polyline so it has a knuckle — a straight spike
   * from a hub is the mace this kit must not draw.
   */
  private finger(finger: { at: number; spread: number; length: number }, grip: number): void {
    // The fingers **close**, they do not meet. Shut all the way they converge
    // on one point and the hand renders as a leaf — found in the renderer,
    // where "is this a hand" is the only place that question can be asked.
    // What reads as a grip is five digits that stay five while the gaps
    // between them shrink.
    const curl = finger.spread * (1 - grip * 0.3);
    const knuckle = finger.length * 0.5;
    const midX = Math.cos(curl) * knuckle;
    const midY = Math.sin(curl) * knuckle;
    const tipAngle = curl - finger.spread * grip * 0.45;
    beginShape();
    vertex(0, 0);
    vertex(midX, midY);
    vertex(midX + Math.cos(tipAngle) * (finger.length - knuckle), midY + Math.sin(tipAngle) * (finger.length - knuckle));
    endShape();
  }
}

export default class Shikamaru_E extends api.Spell {
  /**
   * Told, not inferred. Inference reads an aimed cast as `Damage | Poke |
   * Burst`; 18 damage is not why anybody presses this. `Cc` is the term
   * `scoreSpell` pays for and it is the honest one — a silence is crowd
   * control that happens to leave the legs working.
   */
  static aiRoles = api.enums.SpellRole.Cc | api.enums.SpellRole.Damage;

  name = 'Kage Kubi Shibari';
  image = api.asset('spell_shikamaru_e');
  description =
    'Một bàn tay bóng trồi lên tại điểm chỉ định. Sau <span class="time">0.35 giây</span> nó ' +
    `siết lại: ${dmg(18, 'MAGIC')} và ` +
    '<span class="buff">câm lặng</span> trong <span class="time">1.4 giây</span> — không dùng ' +
    'được chiêu nào. Nhắm xuống đất chứ không khoá vào người, nên né được.';
  coolDown = E_COOLDOWN_MS;
  manaCost = E_CHAKRA;
  targetingMode = 'POINT' as const;
  range = E_RANGE;

  onSpellCast(): void {
    const at = api.utils.VectorUtils.getVectorWithMaxRange(
      this.owner.position,
      this.aimPoint,
      E_RANGE
    ).to;

    const hand = new Shikamaru_E_Grasp(this.owner);
    hand.position.set(at.x, at.y);
    this.game.objectManager.addObject(hand);
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
