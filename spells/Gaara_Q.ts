import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { RANGE_BAND, SIGHT, clamp01, impactBurst, snapOut, windIn } from '../spellVfx';
import { Gaara_Q_Sand, SAND_SLOW, SAND_SLOW_MS } from './Gaara_Q_Sand';

const QRectangle = api.utils.Quadtree.Rectangle;
const Circle = api.utils.Quadtree.Circle;
const dmg = api.text.dmg;
const dmgValue = api.text.dmgValue;

/**
 * Suna Shigure — sand gathers at a spot, then erupts out of the ground.
 *
 * The script:
 *
 *   press a spot        → sand pulls together on the ground there
 *   ~0.4s later         → it erupts, hitting whoever is still standing on it
 *   whoever was caught  → takes damage and is slowed
 *   the sand falls back → the patch keeps slowing and biting for 2.2s
 *   the patch dies      → the fill goes first, the rim last
 *
 * ## Why it is telegraphed, and why that is the champion
 *
 * Every other ability in this pack asks "can you dodge this": a Rasengan
 * thrown, a Chidori arriving, an arrow loosed. This one is slower than the
 * enemy on purpose. The 0.4s is not a cost the ability is paying for its
 * damage — it is the whole ability, because what Gaara actually does is take
 * ground away, and ground is only taken away from someone who can see it
 * happening and chooses where to stand anyway.
 *
 * That is also why the damage is small and the patch is long. A player who
 * eats the column made a mistake worth 22; a player who keeps walking through
 * the sand afterwards pays for it four more times.
 */
export const Q_RANGE = RANGE_BAND.ABILITY;
export const Q_RADIUS = 96;
/** How long the sand gathers before it erupts — the window to walk out. */
export const Q_TELL_MS = 400;
/** The eruption itself: how long the column stands before it falls back. */
export const Q_ERUPT_MS = 320;
export const Q_DAMAGE = 22;
export const Q_COOLDOWN_MS = 8_000;
export const Q_CHAKRA = 45;

export class Gaara_Q_Column extends api.SpellObject {
  /**
   * A landed hit, so it lights where it landed and no further.
   *
   * `IMPACT` and not `ZONE`: this object is the moment, and the patch it
   * leaves behind carries the longer, wider look at the ground. Two objects
   * with two different jobs, so two different bands.
   */
  visionRadius = SIGHT.IMPACT;

  radius = Q_RADIUS;

  private ageMs = 0;
  private erupted = false;
  private settled = false;
  private spikes: { angle: number; height: number; lean: number }[] = [];

  private burst = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(206, 174, 116, 0.9)',
    0.4
  );

  onAdded(): void {
    // Seeded once. A spike that re-rolls its height every frame is a strobe,
    // not sand — `docs/VFX_STANDARD.md` names this exact mistake.
    for (let spike = 0; spike < 13; spike++) {
      this.spikes.push({
        angle: (spike / 13) * Math.PI * 2 + Math.random() * 0.22,
        height: 0.62 + Math.random() * 0.5,
        lean: (Math.random() - 0.5) * 0.5,
      });
    }
    this.useParticles(this.burst);
  }

  update(): void {
    this.ageMs += deltaTime;

    if (!this.erupted && this.ageMs >= Q_TELL_MS) {
      this.erupted = true;
      this.erupt();
    }

    // It is not removed on the frame it deals damage. The column stands for a
    // beat and falls back, which is what leaves the shape of the area on
    // screen long enough to be read — the dissipation phase everyone skips.
    if (!this.settled && this.ageMs >= Q_TELL_MS + Q_ERUPT_MS) {
      this.settled = true;
      this.toRemove = true;
    }
  }

  private erupt(): void {
    const caught = this.game.objectManager.queryObjects({
      area: new Circle({ x: this.position.x, y: this.position.y, r: this.radius }),
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];

    for (const unit of caught) {
      unit.takeDamage(Q_DAMAGE, this.owner, 'MAGIC', 'Suna Shigure');
      // The burst goes on the victim, not where the column happens to be
      // centred: an impact drawn near a hit rather than on it tells the
      // player nothing about whether they connected.
      impactBurst(this.burst, unit.position, 10, 24, 11);

      const slow = new api.buffs.Slow(SAND_SLOW_MS, this.owner, unit);
      slow.percent = SAND_SLOW;
      slow.buffAddType = api.enums.BuffAddType.RENEW_EXISTING;
      slow.image = api.asset('spell_gaara_q');
      unit.addBuff(slow);
    }
  }

  /** Whatever went up has to come back down, and it lies where it fell. */
  onRemoved(): void {
    super.onRemoved?.();
    const sand = new Gaara_Q_Sand(this.owner);
    sand.position.set(this.position.x, this.position.y);
    this.game.objectManager.addObject(sand);
  }

  getDisplayBoundingBox(): Rectangle {
    // The spikes reach above the disc, so the box is not the hit radius.
    const reach = this.radius + 70;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  draw(): void {
    const centre = this.position;
    const telling = clamp01(this.ageMs / Q_TELL_MS);
    const rising = clamp01((this.ageMs - Q_TELL_MS) / Q_ERUPT_MS);

    push();

    if (!this.erupted) {
      // ANTICIPATION. The ring is drawn at the radius the damage really uses,
      // so a player deciding whether to move is reading the true edge and not
      // a decorative one. `windIn` because the gather should feel like it is
      // being pulled — slow, then all at once.
      const gather = windIn(telling);
      noStroke();
      fill(150, 116, 66, 70 + 60 * gather);
      circle(centre.x, centre.y, this.radius * 2 * (0.55 + 0.45 * gather));

      noFill();
      stroke(74, 52, 26, 210);
      strokeWeight(3);
      circle(centre.x, centre.y, this.radius * 2);

      // Grains pulled inward along the radius. Motion agreeing with the
      // effect: the sand is being gathered, so everything travels in.
      noStroke();
      fill(206, 174, 116, 230);
      for (const spike of this.spikes) {
        const along = this.radius * (1 - gather * 0.75);
        circle(
          centre.x + Math.cos(spike.angle) * along,
          centre.y + Math.sin(spike.angle) * along,
          4 + spike.height * 3
        );
      }
      pop();
      return;
    }

    // CLIMAX into DISSIPATION, on one normalized `t`. `snapOut` so the column
    // arrives fast and settles, rather than sliding at a constant rate — a
    // linear rise is what makes an effect look like a placeholder.
    const up = snapOut(clamp01(rising * 1.6));
    const falling = clamp01((rising - 0.55) / 0.45);
    const alpha = 1 - falling;

    noStroke();
    fill(150, 116, 66, 150 * alpha);
    circle(centre.x, centre.y, this.radius * 2);

    for (const spike of this.spikes) {
      const tall = this.radius * 0.92 * spike.height * up * (1 - falling * 0.7);
      const baseX = centre.x + Math.cos(spike.angle) * this.radius * 0.52;
      const baseY = centre.y + Math.sin(spike.angle) * this.radius * 0.52;
      const tipX = baseX + Math.cos(spike.angle + spike.lean) * tall * 0.35;
      const tipY = baseY + Math.sin(spike.angle + spike.lean) * tall * 0.35 - tall * 0.5;
      const width = 9 + spike.height * 5;

      // A dark rim under each spike rather than around the group, or the
      // whole eruption merges into one blob at a glance.
      fill(74, 52, 26, 210 * alpha);
      triangle(baseX - width, baseY, baseX + width, baseY, tipX, tipY);
      fill(206, 174, 116, 235 * alpha);
      triangle(baseX - width * 0.6, baseY, baseX + width * 0.6, baseY, tipX, tipY + 3);
    }

    // The rim outlives the fill: it is the thing that was stating the radius.
    noFill();
    stroke(74, 52, 26, 220 * (1 - falling * 0.5));
    strokeWeight(3);
    circle(centre.x, centre.y, this.radius * 2);
    pop();
  }
}

export default class Gaara_Q extends api.Spell {
  /**
   * Left to inference on purpose.
   *
   * Core's `inferRoles` reads an aimed damage ability as `Damage | Poke |
   * Burst`, which is exactly what this is, and the pack's `botRoles` sweep
   * scores it against the rest of the kit rather than against a guess. The
   * two abilities that *do* carry a tag below are the ones inference is
   * documented as refusing to guess.
   */
  name = 'Suna Shigure';
  image = api.asset('spell_gaara_q');
  description =
    'Cát tụ lại tại một điểm rồi <b>trồi lên</b> sau <span class="time">0.4 giây</span>, gây ' +
    `${dmg(22, 'MAGIC')} và <span class="buff">làm chậm 35%</span>. ` +
    `Bãi cát ở lại <span class="time">2.2 giây</span>, gây ${dmgValue(8, 'MAGIC')} ` +
    'mỗi 0.5 giây và giữ nguyên hiệu ứng làm chậm cho ai còn đứng trong đó.';
  coolDown = Q_COOLDOWN_MS;
  manaCost = Q_CHAKRA;
  targetingMode = 'POINT' as const;
  range = Q_RANGE;

  onSpellCast(): void {
    const spot = api.utils.VectorUtils.getVectorWithMaxRange(
      this.owner.position,
      this.aimPoint,
      Q_RANGE
    ).to;

    const column = new Gaara_Q_Column(this.owner);
    column.position.set(spot.x, spot.y);
    this.game.objectManager.addObject(column);
  }

  drawPreview(): void {
    // `POINT` stays on the authored number: the far end of a point cast is
    // ground, and ground has no body to reach past.
    super.drawPreview(this.range);
  }
}
