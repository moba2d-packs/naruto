import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { RANGE_BAND, SHADOW, clamp01, impactSpray, snapOut, windIn } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;
const Circle = api.utils.Quadtree.Circle;

/**
 * Kage Nui — he leaves a piece of his shadow lying on the floor and walks
 * away from it.
 *
 * The script:
 *
 *   press a point within 300  → a flat patch of shadow settles there
 *   0.6s later                → it is armed, and nearly invisible
 *   an enemy walks within 78  → needles stitch up out of it: 25, and they are
 *                               slowed by half for 1.8s
 *   it is spent               → the needles fold back down
 *   nothing walks in          → it lies there for 4.5s and goes
 *
 * ## The pack's first trap, and it is drawn to be hard to see
 *
 * `docs/VFX_STANDARD.md` sets a size floor — anything the player has to
 * *find* wants 40 units and a contrasting rim — and then names the one
 * deliberate exception: a concealed object inverts it, because being hard to
 * see is what it is for. So this is drawn faintly, and **only for his own
 * team**: an enemy gets no picture at all until the needles come up.
 *
 * That is a real power, so it is paid for elsewhere: it arms slowly, it lasts
 * a few seconds rather than a minute, one body spends it, and it is his
 * longest cooldown.
 */
export const W_RANGE = RANGE_BAND.PLACED;
export const W_ARM_MS = 600;
/**
 * How long it lies there.
 *
 * Deliberately shorter than half its cooldown — a trap that outlives its own
 * wait is a permanent piece of terrain rather than a decision about *when*.
 * `tests/tempo.test.ts` holds the arithmetic.
 */
export const W_LIFETIME_MS = 4_500;
/** How close a body has to come. Wider than a champion, tighter than a blast. */
export const W_TRIGGER = 78;
export const W_DAMAGE = 25;
export const W_SLOW = 0.5;
export const W_SLOW_MS = 1_800;
/** The needles standing up, and then folding back. */
export const W_SPRING_MS = 420;
export const W_COOLDOWN_MS = 10_000;
export const W_CHAKRA = 50;

const NEEDLES = 11;

/**
 * The patch: lying, armed, sprung, spent.
 *
 * Dark (no `visionRadius`) and it is not a close call: a trap that lit the
 * fog would be a ward that also does damage, which is two abilities.
 */
export class Shikamaru_W_Snare extends api.SpellObject {
  private ageMs = 0;
  private sprungAtMs: number | null = null;
  /** Seeded once — needles that re-roll their length every frame flicker. */
  private needles: { at: number; length: number; lean: number }[] = [];

  private grit = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(150, 122, 226, 0.85)',
    0.5
  );

  onAdded(): void {
    for (let needle = 0; needle < NEEDLES; needle++) {
      this.needles.push({
        at: (needle / NEEDLES) * Math.PI * 2 + Math.random() * 0.25,
        length: 26 + Math.random() * 22,
        lean: (Math.random() - 0.5) * 0.5,
      });
    }
    this.useParticles(this.grit);
  }

  update(): void {
    this.ageMs += deltaTime;

    if (this.sprungAtMs !== null) {
      if (this.ageMs - this.sprungAtMs >= W_SPRING_MS) this.toRemove = true;
      return;
    }
    if (this.ageMs >= W_LIFETIME_MS) {
      this.toRemove = true;
      return;
    }
    if (this.ageMs < W_ARM_MS) return;

    const caught = this.game.objectManager.queryObjects({
      area: new Circle({ x: this.position.x, y: this.position.y, r: W_TRIGGER }),
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];
    if (caught.length > 0) this.spring(caught);
  }

  /** Idempotent: one body spends it, however many arrive on the same frame. */
  private spring(caught: AttackableUnit[]): void {
    if (this.sprungAtMs !== null) return;
    this.sprungAtMs = this.ageMs;

    for (const victim of caught) {
      victim.takeDamage(W_DAMAGE, this.owner, 'MAGIC', 'Kage Nui');
      // Grit thrown *up* out of the floor, away from the patch — the needles
      // came from under them, and debris has to follow the verb.
      const away = Math.atan2(
        victim.position.y - this.position.y,
        victim.position.x - this.position.x
      );
      impactSpray(this.grit, victim.position, away, 10, 22, 10);

      const slowed = new api.buffs.Slow(W_SLOW_MS, this.owner, victim);
      slowed.percent = W_SLOW;
      slowed.image = api.asset('spell_shikamaru_w');
      slowed.buffAddType = api.enums.BuffAddType.RENEW_EXISTING;
      victim.addBuff(slowed);
    }
  }

  /** True once it has caught somebody. Read by the tests and by `draw`. */
  get sprung(): boolean {
    return this.sprungAtMs !== null;
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = W_TRIGGER + 60;
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

    if (this.sprungAtMs === null) {
      // **Concealed on purpose, and only for his own side.** The standard's
      // size floor is inverted here by design; an enemy sees nothing at all,
      // which is what a trap is. Drawing it for everyone at low alpha would
      // be the worst of both — visible enough to dodge, faint enough to miss.
      if (this.owner.teamId !== this.game.player?.teamId) return;

      const arming = clamp01(this.ageMs / W_ARM_MS);
      const settled = this.ageMs >= W_ARM_MS;
      const alpha = settled ? 0.34 : 0.34 * windIn(arming);

      push();
      noStroke();
      fill(SHADOW.BODY[0], SHADOW.BODY[1], SHADOW.BODY[2], 200 * alpha);
      circle(centre.x, centre.y, W_TRIGGER * 2 * 0.55);
      noFill();
      stroke(SHADOW.RIM[0], SHADOW.RIM[1], SHADOW.RIM[2], 190 * alpha);
      strokeWeight(2);
      // The rim on the radius it really triggers at, so his own team can
      // walk a fight into it on purpose.
      circle(centre.x, centre.y, W_TRIGGER * 2);
      // A slow turn while it waits: armed and inert have to look different,
      // or he cannot tell whether the thing he placed is live yet.
      if (settled) {
        const spin = this.ageMs / 900;
        strokeWeight(3);
        for (let mark = 0; mark < 3; mark++) {
          const at = spin + (mark / 3) * Math.PI * 2;
          line(
            centre.x + Math.cos(at) * 12,
            centre.y + Math.sin(at) * 12,
            centre.x + Math.cos(at) * 26,
            centre.y + Math.sin(at) * 26
          );
        }
      }
      pop();
      return;
    }

    // CLIMAX and DISSIPATION: the needles come up fast and fold back slowly,
    // and everybody can see them — the concealment ends the moment it fires.
    const sprung = clamp01((this.ageMs - this.sprungAtMs) / W_SPRING_MS);
    const up = sprung < 0.25 ? snapOut(sprung / 0.25) : 1 - snapOut((sprung - 0.25) / 0.75) * 0.9;
    const alpha = 1 - sprung * 0.75;

    push();
    // Rims first, every one of them, then bodies — see `SHADOW`'s own note.
    noFill();
    stroke(SHADOW.RIM[0], SHADOW.RIM[1], SHADOW.RIM[2], 240 * alpha);
    strokeWeight(7);
    for (const needle of this.needles) this.needle(centre, needle, up);
    stroke(SHADOW.BODY[0], SHADOW.BODY[1], SHADOW.BODY[2], 250 * alpha);
    strokeWeight(3.5);
    for (const needle of this.needles) this.needle(centre, needle, up);

    // The rim stays on the radius that actually caught them, and is the last
    // thing to go — the next trap is placed by somebody who saw this one.
    stroke(SHADOW.RIM[0], SHADOW.RIM[1], SHADOW.RIM[2], 200 * alpha);
    strokeWeight(2.5);
    circle(centre.x, centre.y, W_TRIGGER * 2);
    pop();
  }

  private needle(
    centre: { x: number; y: number },
    needle: { at: number; length: number; lean: number },
    up: number
  ): void {
    const root = 10;
    const tip = root + needle.length * up;
    const lean = needle.at + needle.lean * up;
    line(
      centre.x + Math.cos(needle.at) * root,
      centre.y + Math.sin(needle.at) * root,
      centre.x + Math.cos(lean) * tip,
      centre.y + Math.sin(lean) * tip - 8 * up
    );
  }
}

export default class Shikamaru_W extends api.Spell {
  /**
   * Left to inference. A `POINT` cast that damages is read as `Damage | Poke`,
   * which is what a bot needs to know; there is no role for "this is a trap",
   * and inventing one the scorer has no term for makes a bot press it less.
   */
  name = 'Kage Nui';
  image = api.asset('spell_shikamaru_w');
  description =
    'Đặt một mảng bóng nằm im dưới đất — <b>chỉ đồng đội nhìn thấy</b>. Sau ' +
    '<span class="time">0.6 giây</span> nó lên nòng; kẻ địch đầu tiên bước vào bị kim bóng ' +
    'đâm lên: <span class="damage magic">25</span> sát thương và ' +
    '<span class="buff">làm chậm 50%</span> trong <span class="time">1.8 giây</span>. Không ai ' +
    'giẫm phải thì nó tan sau <span class="time">4.5 giây</span>.';
  coolDown = W_COOLDOWN_MS;
  manaCost = W_CHAKRA;
  targetingMode = 'POINT' as const;
  range = W_RANGE;

  onSpellCast(): void {
    const at = api.utils.VectorUtils.getVectorWithMaxRange(
      this.owner.position,
      this.aimPoint,
      W_RANGE
    ).to;

    const snare = new Shikamaru_W_Snare(this.owner);
    snare.position.set(at.x, at.y);
    this.game.objectManager.addObject(snare);
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
