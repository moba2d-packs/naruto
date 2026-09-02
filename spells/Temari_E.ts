import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { WIND, clamp01 } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;
const Circle = api.utils.Quadtree.Circle;

/**
 * Fūton: Renpū — she puts the fan behind her and lets the gale take her.
 *
 * The script:
 *
 *   press a direction  → she rides a gust a short way
 *   behind her         → the disturbed air stays for 1.6s
 *   anyone standing    → in it is slowed by 40%
 *     in that air      →
 *   nobody is hurt     → at all
 *
 * ## The one thing she has that is not an attack
 *
 * She is ranged, she is soft, and her other three buttons are all pointed at
 * somebody. Without this she is a champion with no answer to the moment
 * somebody reaches her — and it is the *trail*, not the distance, that makes
 * it an answer: 260 units of movement buys a second, and a wall of slow air
 * across the gap buys the rest.
 *
 * ## Zero damage, like Shikamaru's hold
 *
 * The second ability in the pack that hurts nobody. It is deliberate the same
 * way his is: an escape that also pokes is an escape pressed on cooldown for
 * the poke, and then it is never up when it is needed.
 */
export const E_DISTANCE = 260;
export const E_SPEED = 17;
/** How long the ride takes, derived so a retune cannot leave the tooltip lying. */
export const E_RIDE_MS = (E_DISTANCE / E_SPEED) * (1000 / 60);
/** The air she left behind. */
export const E_WAKE_MS = 1_600;
export const E_WAKE_WIDTH = 120;
export const E_SLOW = 0.4;
/** Dissipation: the wake thins out rather than blinking out. */
export const E_FADE_MS = 340;
export const E_COOLDOWN_MS = 12_000;
export const E_CHAKRA = 50;

/**
 * The disturbed air she left, lying along the path she took.
 *
 * A capsule, not a circle: she travelled, so the slow is a corridor. Building
 * a circle around the midpoint would be a different shape from the one on
 * screen, which is the first legibility failure `docs/VFX_STANDARD.md` names.
 *
 * Dark (no `visionRadius`): it lies across ground she has just run through
 * and can see, and sight on an escape would make fleeing a scouting move.
 */
export class Temari_E_Wake extends api.SpellObject {
  /** Where the ride began. The corridor runs from here to `position`. */
  from = { x: 0, y: 0 };

  private ageMs = 0;
  /** Seeded once — streamlines that re-roll every frame flicker. */
  private lines: { along: number; across: number; length: number }[] = [];

  onAdded(): void {
    for (let stream = 0; stream < 14; stream++) {
      this.lines.push({
        along: Math.random(),
        across: (Math.random() - 0.5) * 1.7,
        length: 22 + Math.random() * 34,
      });
    }
  }

  update(): void {
    this.ageMs += deltaTime;
    if (this.ageMs >= E_WAKE_MS + E_FADE_MS) {
      this.toRemove = true;
      return;
    }
    if (this.ageMs >= E_WAKE_MS) return;

    for (const victim of this.inside()) {
      const slowed = new api.buffs.Slow(300, this.owner, victim);
      slowed.percent = E_SLOW;
      slowed.image = api.asset('spell_temari_e');
      slowed.buffAddType = api.enums.BuffAddType.RENEW_EXISTING;
      victim.addBuff(slowed);
    }
  }

  /** Everybody standing in the corridor — the shape `draw` paints. */
  private inside(): AttackableUnit[] {
    const dx = this.position.x - this.from.x;
    const dy = this.position.y - this.from.y;
    const length = Math.hypot(dx, dy) || 1;
    const alongX = dx / length;
    const alongY = dy / length;
    const midX = (this.from.x + this.position.x) / 2;
    const midY = (this.from.y + this.position.y) / 2;

    return (
      this.game.objectManager.queryObjects({
        area: new Circle({ x: midX, y: midY, r: length / 2 + E_WAKE_WIDTH }),
        filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
      }) as AttackableUnit[]
    ).filter(unit => {
      const ux = unit.position.x - this.from.x;
      const uy = unit.position.y - this.from.y;
      const along = ux * alongX + uy * alongY;
      if (along < 0 || along > length) return false;
      return Math.abs(-ux * alongY + uy * alongX) <= E_WAKE_WIDTH / 2;
    });
  }

  getDisplayBoundingBox(): Rectangle {
    const pad = E_WAKE_WIDTH;
    return new QRectangle({
      x: Math.min(this.from.x, this.position.x) - pad,
      y: Math.min(this.from.y, this.position.y) - pad,
      w: Math.abs(this.position.x - this.from.x) + pad * 2,
      h: Math.abs(this.position.y - this.from.y) + pad * 2,
      data: this,
    });
  }

  draw(): void {
    const fading = clamp01((this.ageMs - E_WAKE_MS) / E_FADE_MS);
    const alpha = 1 - fading;
    const dx = this.position.x - this.from.x;
    const dy = this.position.y - this.from.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) return;
    const heading = Math.atan2(dy, dx);
    const half = E_WAKE_WIDTH / 2;

    push();
    translate(this.from.x, this.from.y);
    rotate(heading);

    // The corridor the slow really uses. Faint fill, hard rails: the rails
    // are the two boundaries a player has to read to walk around it.
    noStroke();
    fill(WIND.PALE[0], WIND.PALE[1], WIND.PALE[2], 22 * alpha);
    rect(0, -half, length, E_WAKE_WIDTH);
    stroke(WIND.PALE[0], WIND.PALE[1], WIND.PALE[2], 170 * alpha);
    strokeWeight(2.5);
    line(0, -half, length, -half);
    line(0, half, length, half);

    // Streamlines drifting the way she went, so the corridor reads as moving
    // air rather than as a painted rectangle.
    stroke(WIND.EDGE[0], WIND.EDGE[1], WIND.EDGE[2], 150 * alpha);
    strokeWeight(2);
    const drift = (this.ageMs / 900) % 1;
    for (const stream of this.lines) {
      const at = ((stream.along + drift) % 1) * length;
      const y = stream.across * half;
      line(at, y, Math.min(at + stream.length, length), y);
    }
    pop();
  }
}

export default class Temari_E extends api.Spell {
  /**
   * Told, and `Dash` is the half core refuses to infer — for the reason that
   * matters here: a bot that files its escape as an engage rides it *into*
   * whatever is chasing. It deals no damage, so no damage-shaped tag would be
   * honest, and a tag the scorer has no term for makes a bot press it less.
   */
  static aiRoles = api.enums.SpellRole.Dash | api.enums.SpellRole.Cc;

  name = 'Fūton: Renpū';
  image = api.asset('spell_temari_e');
  description =
    'Temari cưỡi một luồng gió lướt đi một đoạn ngắn. Vệt gió còn lại phía sau ' +
    '<span class="buff">làm chậm 40%</span> kẻ địch đứng trong đó suốt ' +
    '<span class="time">1.6 giây</span>. <b>Không gây sát thương</b> — đây là đường lui, ' +
    'không phải một đòn đánh.';
  coolDown = E_COOLDOWN_MS;
  manaCost = E_CHAKRA;
  targetingMode = 'DIRECTION' as const;
  range = E_DISTANCE;

  /** A grounded champion cannot ride anything, and should not pay to learn it. */
  checkCastCondition(): boolean {
    return api.buffs.Dash.CanDash(this.owner);
  }

  onSpellCast(): void {
    // Per cast, not per champion: the second ride has its own wake, and a
    // flag left true from the first one would silently swallow it.
    this.wakeLaid = false;
    const from = { x: this.owner.position.x, y: this.owner.position.y };
    const to = api.utils.VectorUtils.getVectorWithRange(
      this.owner.position,
      this.aimPoint,
      E_DISTANCE
    ).to;

    const ride = new api.buffs.Dash(E_RIDE_MS + 300, this.owner, this.owner);
    ride.image = this.image;
    ride.dashDestination = to;
    ride.dashSpeed = E_SPEED;
    ride.showTrail = false;
    // The wake is laid down when she arrives, so it covers the ground she
    // actually crossed rather than the ground she meant to.
    ride.onReachedDestination = () => this.layWake(from);
    // Knocked out of it, she still leaves the air she has already disturbed.
    ride.onCancelled = () => this.layWake(from);
    this.owner.addBuff(ride);
  }

  /** Idempotent: arriving and being interrupted can both reach this. */
  private layWake(from: { x: number; y: number }): void {
    if (this.wakeLaid) return;
    this.wakeLaid = true;
    const wake = new Temari_E_Wake(this.owner);
    wake.from = from;
    wake.position.set(this.owner.position.x, this.owner.position.y);
    this.game.objectManager.addObject(wake);
  }

  private wakeLaid = false;

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
