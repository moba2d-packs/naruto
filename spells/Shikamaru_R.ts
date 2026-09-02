import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { SHADOW, SIGHT, clamp01, impactSpray, snapOut } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;
const Circle = api.utils.Quadtree.Circle;

/**
 * Kagemane Shūchū — his shadow stops being a line and becomes a network.
 *
 * The script:
 *
 *   press                → the shadow leaves him in seven directions at once
 *   over 0.7s            → the tendrils crawl outward and fork
 *   anybody a tendril    → takes 42 and is rooted for 1.1s, once
 *     reaches            →
 *   for 1.2s after       → the web holds its shape
 *   the last 0.5s        → it draws back into him
 *   and he may walk      → the whole time
 *
 * ## It is his Q's opposite, deliberately
 *
 * Q is one line and he cannot move; this is seven and he can. That is the
 * whole argument for pressing the ultimate: not more damage, *freedom*. A
 * champion whose basic lockdown costs him his feet needs one button that does
 * not, or the fight where he is being chased is a fight where he has no kit.
 *
 * ## The hitbox is the drawn web, exactly
 *
 * The tendrils are built once, in world coordinates, and both the drawing and
 * the damage walk the same arrays — so what is on screen *is* what catches.
 * `docs/VFX_STANDARD.md` names drawing one shape and damaging another as the
 * first legibility failure, and a branching effect is the easiest place in
 * the world to commit it by approximating with a circle.
 */
export const R_REACH = 300;
export const R_GROW_MS = 700;
export const R_HOLD_MS = 1_200;
export const R_FADE_MS = 500;
/** Everything one web is worth to one body. Ultimate band: 40–60. */
export const R_DAMAGE = 42;
export const R_ROOT_MS = 1_100;
/** How close a body has to be to a tendril. Roughly one champion wide. */
export const R_TENDRIL_HIT = 34;
export const R_COOLDOWN_MS = 10_000;
export const R_CHAKRA = 100;

const PRIMARIES = 7;
const SEGMENTS = 9;
const FORKS = 2;

interface Strand {
  points: { x: number; y: number }[];
  /** Where along the parent's life this strand starts growing, 0..1. */
  startsAt: number;
  width: number;
}

/**
 * The web: it crawls, it holds, it draws back.
 *
 * Lights the ground it covers — unlike the rest of his shadow, this one is
 * thrown out across a fight he is not standing in the middle of, and the rule
 * is that you see about as far as you hit.
 */
export class Shikamaru_R_Web extends api.SpellObject {
  visionRadius = SIGHT.ZONE;

  private ageMs = 0;
  private strands: Strand[] = [];
  private caught = new Set<AttackableUnit>();

  private dark = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(150, 122, 226, 0.85)',
    0.5
  );

  onAdded(): void {
    const headings = this.headings();
    for (let primary = 0; primary < PRIMARIES; primary++) {
      const angle = headings[primary];
      // 0.72 of the reach, not 0.95: a wandering tendril covers more arc
      // length than a straight one, so a strand written to the full radius
      // ends up outside the circle that is supposed to bound it — and that
      // circle is the rim the player reads.
      const main = this.strand(this.position.x, this.position.y, angle, R_REACH * 0.78);
      this.strands.push({ points: main, startsAt: 0, width: 13 });

      for (let fork = 0; fork < FORKS; fork++) {
        const at = Math.floor(main.length * (0.35 + fork * 0.3));
        const root = main[at];
        if (!root) continue;
        const side = fork % 2 === 0 ? 1 : -1;
        this.strands.push({
          points: this.strand(
            root.x,
            root.y,
            angle + side * (0.6 + Math.random() * 0.5),
            R_REACH * 0.34
          ),
          // Forks start when the parent has grown past their root, so a
          // branch never appears ahead of the thing it grew out of.
          startsAt: at / SEGMENTS,
          width: 8,
        });
      }
    }
    this.useParticles(this.dark);
  }

  /**
   * Which way each primary strand sets off.
   *
   * **It hunts.** The first cut sent seven strands out at even angles with a
   * random offset, and the angular gap between two of them at mid radius is
   * far wider than a body — so whether a 100-chakra ultimate caught the
   * person standing 120 units away came down to the seed. Its own tests
   * failed about one run in five, which is the same coin the player would
   * have been tossing.
   *
   * So the strands that have somebody to go to, go to them, and the rest
   * spread out to cover the ground. The wander in `strand` is then purely
   * cosmetic — it is what stops seven straight rays reading as a mace — and
   * the ability stops being a lottery without becoming a disc.
   *
   * `visibleTo` because this *chooses* units: the filter is on acquisition,
   * never on damage. A strand that grew toward a champion in an unlit bush
   * would be a shadow that can see through fog.
   */
  private headings(): number[] {
    const marks = (
      this.game.objectManager.queryObjects({
        area: new Circle({ x: this.position.x, y: this.position.y, r: R_REACH }),
        filters: [
          api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId),
          api.combat.PredefinedFilters.visibleTo(this.owner),
        ],
      }) as AttackableUnit[]
    ).slice(0, PRIMARIES);

    const out: number[] = [];
    for (const mark of marks) {
      out.push(
        Math.atan2(mark.position.y - this.position.y, mark.position.x - this.position.x)
      );
    }
    // The rest fan out evenly, so the web still covers ground nobody is
    // standing on — it is terrain as well as a hit.
    const spare = PRIMARIES - out.length;
    for (let index = 0; index < spare; index++) {
      out.push((index / Math.max(spare, 1)) * Math.PI * 2 + Math.random() * 0.4);
    }
    return out;
  }

  /**
   * One tendril, as a polyline that wanders **around** its own heading.
   *
   * A random walk was the first version and it accumulates: seven strands
   * meant to go seven ways all drifted the same way and piled into a single
   * streak. Wander is a bounded wobble off a fixed angle, and that is what
   * keeps a web a web.
   */
  private strand(
    fromX: number,
    fromY: number,
    angle: number,
    length: number
  ): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];
    const phase = Math.random() * Math.PI * 2;
    let x = fromX;
    let y = fromY;
    for (let step = 0; step <= SEGMENTS; step++) {
      points.push({ x, y });
      // The wobble has to *close* at the far end, or a strand aimed at
      // somebody arrives beside them. Its amplitude tapers to nothing over
      // the last third, which keeps the crawl and lands the hit.
      const along = step / SEGMENTS;
      const taper = along < 0.66 ? 1 : 1 - (along - 0.66) / 0.34;
      const at = angle + Math.sin(along * 5.5 + phase) * 0.34 * taper;
      x += Math.cos(at) * (length / SEGMENTS);
      y += Math.sin(at) * (length / SEGMENTS);
    }
    return points;
  }

  update(): void {
    this.ageMs += deltaTime;
    if (this.ageMs >= R_GROW_MS + R_HOLD_MS + R_FADE_MS) {
      this.toRemove = true;
      return;
    }

    const grown = this.grown();
    if (grown <= 0) return;

    const candidates = this.game.objectManager.queryObjects({
      area: new Circle({ x: this.position.x, y: this.position.y, r: R_REACH }),
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];

    for (const victim of candidates) {
      if (this.caught.has(victim)) continue;
      if (!this.touches(victim, grown)) continue;
      this.caught.add(victim);
      this.take(victim);
    }
  }

  /** How much of every strand has crawled out, 0..1. */
  private grown(): number {
    return clamp01(this.ageMs / R_GROW_MS);
  }

  /**
   * Whether any *grown* part of any strand reaches this body.
   *
   * Walks the same arrays `draw()` walks, which is the point: the hitbox is
   * not an approximation of the picture, it is the picture.
   */
  private touches(victim: AttackableUnit, grown: number): boolean {
    for (const strand of this.strands) {
      const live = this.liveCount(strand, grown);
      for (let index = 0; index < live; index++) {
        const point = strand.points[index];
        const dx = victim.position.x - point.x;
        const dy = victim.position.y - point.y;
        if (dx * dx + dy * dy <= R_TENDRIL_HIT * R_TENDRIL_HIT) return true;
      }
    }
    return false;
  }

  /** How many of a strand's points exist yet, given the overall growth. */
  private liveCount(strand: Strand, grown: number): number {
    const own = (grown - strand.startsAt) / Math.max(1 - strand.startsAt, 0.001);
    if (own <= 0) return 0;
    return Math.min(strand.points.length, Math.ceil(clamp01(own) * strand.points.length));
  }

  private take(victim: AttackableUnit): void {
    victim.takeDamage(R_DAMAGE, this.owner, 'MAGIC', 'Kagemane Shūchū');
    const inward = Math.atan2(
      this.position.y - victim.position.y,
      this.position.x - victim.position.x
    );
    impactSpray(this.dark, victim.position, inward, 11, 22, 11);

    const pinned = new api.buffs.Root(R_ROOT_MS, this.owner, victim);
    pinned.image = api.asset('spell_shikamaru_r');
    pinned.buffAddType = api.enums.BuffAddType.RENEW_EXISTING;
    victim.addBuff(pinned);
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = R_REACH + 50;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  draw(): void {
    const fading = clamp01((this.ageMs - R_GROW_MS - R_HOLD_MS) / R_FADE_MS);
    const alpha = 1 - fading;
    // Drawing back in as it goes: the web retreats along itself rather than
    // dimming in place, so the third phase is a movement and not a fade.
    const grown = clamp01(this.grown() - snapOut(fading));
    if (grown <= 0) return;

    push();

    // The reach, drawn whatever the strands are doing — the strands are
    // ragged by design and the rim is the only thing that is not.
    noFill();
    stroke(SHADOW.RIM[0], SHADOW.RIM[1], SHADOW.RIM[2], 150 * alpha);
    strokeWeight(2.5);
    circle(this.position.x, this.position.y, R_REACH * 2);

    // **Rims first, every strand, then bodies.** Per-strand rim-then-body
    // paints each rim over the previous body, and where strands cross — which
    // for a web is everywhere — the whole thing goes violet. Two rounds in
    // `tools/preview-shape.mjs` went into finding that.
    strokeCap(ROUND);
    noFill();
    stroke(SHADOW.RIM[0], SHADOW.RIM[1], SHADOW.RIM[2], 245 * alpha);
    for (const strand of this.strands) {
      strokeWeight(strand.width + 6);
      this.trace(strand, grown);
    }
    stroke(SHADOW.BODY[0], SHADOW.BODY[1], SHADOW.BODY[2], 250 * alpha);
    for (const strand of this.strands) {
      strokeWeight(strand.width);
      this.trace(strand, grown);
    }
    pop();
  }

  private trace(strand: Strand, grown: number): void {
    const live = this.liveCount(strand, grown);
    if (live < 2) return;
    beginShape();
    for (let index = 0; index < live; index++) {
      vertex(strand.points[index].x, strand.points[index].y);
    }
    endShape();
  }
}

export default class Shikamaru_R extends api.Spell {
  /**
   * Told, not inferred. A `SELF` cast is read as `Buff | Shield`, and both
   * halves are wrong here: nothing about this protects him, and `Shield` in
   * `scoreSpell` means "press this when nearly dead" — which is the one
   * moment a 0.7s spreading web is worth least.
   */
  static aiRoles =
    api.enums.SpellRole.Damage | api.enums.SpellRole.Cc | api.enums.SpellRole.Burst;

  name = 'Kagemane Shūchū';
  image = api.asset('spell_shikamaru_r');
  description =
    'Bóng của anh toả ra <b>bảy hướng</b> và rẽ nhánh khắp mặt đất trong ' +
    '<span class="time">0.7 giây</span>. Kẻ địch bị một nhánh chạm tới nhận ' +
    '<span class="damage magic">42</span> sát thương và bị <span class="buff">trói chân</span> ' +
    '<span class="time">1.1 giây</span>, mỗi người một lần. Khác Kagemane: ' +
    '<b>anh vẫn đi lại được</b> suốt thời gian đó.';
  coolDown = R_COOLDOWN_MS;
  manaCost = R_CHAKRA;
  targetingMode = 'SELF' as const;
  range = R_REACH;

  onSpellCast(): void {
    const web = new Shikamaru_R_Web(this.owner);
    web.position.set(this.owner.position.x, this.owner.position.y);
    // Not attached: it is out of his hands and running on its own clock the
    // moment it leaves, which is exactly what lets him walk away from it.
    this.game.objectManager.addObject(web);
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
