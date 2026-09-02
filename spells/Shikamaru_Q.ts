import type {
  AttackableUnit,
  CastContext,
  CastSpec,
  Rectangle,
} from '@moba2d/core/content/types';
import { api } from '../packApi';
import { RANGE_BAND, SHADOW, clamp01, snapOut } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;
const Circle = api.utils.Quadtree.Circle;

/**
 * Kagemane no Jutsu — his shadow runs out along the floor and holds people
 * where they stand, for exactly as long as he is willing to stand still.
 *
 * The script:
 *
 *   press a direction   → his shadow stretches out in a line
 *   everyone it covers  → cannot move, for as long as it holds
 *   while it holds      → he cannot move either, and it drains chakra
 *   press again         → he lets go
 *   he takes a step,    → it breaks, immediately
 *   or is stunned       →
 *   2.5s                → is the most it can ever hold
 *
 * ## Zero damage, on purpose
 *
 * This is the first ability in the pack that does not hurt anybody, and it is
 * the champion's whole thesis: he wins fights by deciding where people are,
 * not by removing them. Giving it a tick of damage would make it a worse
 * version of an ability three other champions already have.
 *
 * ## `SpellForm.CHANNELED`, and it is the only one in this pack
 *
 * `CancelPolicy`'s table says it plainly: `CHANNELED` is the one form that
 * breaks on **the caster's own movement**. Every other ability in this pack
 * survives walking, which is right for them and would be a disaster here — a
 * lockdown you can kite with is a lockdown with no cost. The cost *is* the
 * ability, and the engine already had the exact word for it.
 *
 * It also means a knock-back ends it, which is the counterplay: his own team
 * has to protect the person doing the holding.
 */
export const Q_REACH = RANGE_BAND.ABILITY;
/** How wide the shadow lies. Generous, because it cannot be aimed twice. */
export const Q_WIDTH = 64;
/** The ceiling. Chakra usually runs out first; this is the hard stop. */
export const Q_MAX_MS = 2_500;
export const Q_UPKEEP = 8;
export const Q_UPKEEP_TICK_MS = 250;
/**
 * How long a root lasts once applied.
 *
 * Short, and re-applied every frame the shadow still covers them — so the
 * hold ends a fraction of a second after the shadow does rather than needing
 * a second pass to clean up. `RENEW_EXISTING`, or ten frames of holding would
 * be ten stacked roots.
 */
export const Q_ROOT_MS = 300;
export const Q_COOLDOWN_MS = 9_000;
export const Q_CHAKRA = 45;
/** Dissipation: the shadow pulls back rather than blinking out. */
export const Q_RETRACT_MS = 260;

/**
 * The shadow itself: it reaches out, it holds, it pulls back.
 *
 * Anchored to him — it is his shadow, so it dies with him and moves with him,
 * except that `CHANNELED` means he is not going anywhere while it is out.
 *
 * Dark (no `visionRadius`) deliberately: a shadow that lit the fog would be a
 * 430-unit ward on a nine-second cooldown, which is a scouting tool wearing a
 * crowd-control ability's clothes.
 */
export class Shikamaru_Q_Shadow extends api.SpellObject {
  /** Where it points. Fixed at the press — the hold is not re-aimable. */
  heading = 0;
  /** Set by the spell when the channel ends, so the shadow can pull back. */
  releasedAtMs: number | null = null;

  private ageMs = 0;
  /** Seeded once, so the ragged edge does not crawl every frame. */
  private ripples: number[] = [];

  onAdded(): void {
    for (let ripple = 0; ripple < 9; ripple++) this.ripples.push(Math.random() * Math.PI * 2);
  }

  update(): void {
    if (this.dropIfAttachmentLost()) return;
    const caster = this._anchorUnit as AttackableUnit | null;
    if (caster) this.position.set(caster.position.x, caster.position.y);
    this.ageMs += deltaTime;

    if (this.releasedAtMs !== null) {
      if (this.ageMs - this.releasedAtMs >= Q_RETRACT_MS) this.toRemove = true;
      return;
    }

    for (const held of this.covered()) {
      const pinned = new api.buffs.Root(Q_ROOT_MS, this.owner, held);
      pinned.image = api.asset('spell_shikamaru_q');
      // `Root` stacks ten deep by default, and this re-applies every frame:
      // without this the hold would be sixty roots deep after one second and
      // would take ten times as long to wear off as it should.
      pinned.buffAddType = api.enums.BuffAddType.RENEW_EXISTING;
      held.addBuff(pinned);
    }
  }

  /** Told by the spell. Idempotent: several endings converge on one release. */
  release(): void {
    if (this.releasedAtMs === null) this.releasedAtMs = this.ageMs;
  }

  /**
   * Everybody lying under the shadow.
   *
   * The hitbox is the drawn strip and nothing else — the query is a circle
   * because that is what the quadtree takes, and the strip test below is what
   * actually decides. Drawing one shape and damaging another is the failure
   * `docs/VFX_STANDARD.md` names first.
   */
  private covered(): AttackableUnit[] {
    const reach = api.combat.Reach.effectiveRange(Q_REACH, this.owner);
    const candidates = this.game.objectManager.queryObjects({
      area: new Circle({ x: this.position.x, y: this.position.y, r: reach }),
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];

    const alongX = Math.cos(this.heading);
    const alongY = Math.sin(this.heading);
    return candidates.filter(unit => {
      const dx = unit.position.x - this.position.x;
      const dy = unit.position.y - this.position.y;
      const along = dx * alongX + dy * alongY;
      if (along < 0 || along > Q_REACH) return false;
      const across = Math.abs(-dx * alongY + dy * alongX);
      return across <= Q_WIDTH / 2;
    });
  }

  /** A strip out to 430, not a square around his centre. Built by hand. */
  getDisplayBoundingBox(): Rectangle {
    const tipX = this.position.x + Math.cos(this.heading) * Q_REACH;
    const tipY = this.position.y + Math.sin(this.heading) * Q_REACH;
    const pad = Q_WIDTH;
    return new QRectangle({
      x: Math.min(this.position.x, tipX) - pad,
      y: Math.min(this.position.y, tipY) - pad,
      w: Math.abs(tipX - this.position.x) + pad * 2,
      h: Math.abs(tipY - this.position.y) + pad * 2,
      data: this,
    });
  }

  draw(): void {
    // Reaching, holding, pulling back — one normalized progress each.
    const reaching = clamp01(this.ageMs / 180);
    const pulling =
      this.releasedAtMs === null ? 0 : snapOut(clamp01((this.ageMs - this.releasedAtMs) / Q_RETRACT_MS));
    const length = Q_REACH * snapOut(reaching) * (1 - pulling);
    const alpha = 1 - pulling * 0.9;
    if (length <= 1) return;

    push();
    translate(this.position.x, this.position.y);
    rotate(this.heading);

    // Two passes, rim then body, and never per-strip: a rim drawn after
    // somebody else's body paints over it, and a shadow whose dark half is
    // covered by its own outline is a violet worm. Learned in
    // `tools/preview-shape.mjs`, at the cost of two rounds.
    const half = Q_WIDTH / 2;
    noFill();
    stroke(SHADOW.RIM[0], SHADOW.RIM[1], SHADOW.RIM[2], 235 * alpha);
    strokeWeight(3);
    this.strip(length, half);

    noStroke();
    fill(SHADOW.BODY[0], SHADOW.BODY[1], SHADOW.BODY[2], 232 * alpha);
    this.strip(length, half - 2);

    // The tip: the fastest-moving thing here while it reaches, which is what
    // makes it read as *running out* rather than as appearing at full length.
    const tipGlow = 1 - clamp01(this.ageMs / 260);
    if (tipGlow > 0 && pulling === 0) {
      noStroke();
      fill(SHADOW.RIM[0], SHADOW.RIM[1], SHADOW.RIM[2], 220 * tipGlow);
      circle(length, 0, 26 * tipGlow + 10);
    }

    // A slow ripple down the length while it holds, so a live hold is
    // visibly *live* — a still shape reads as a decal somebody forgot.
    if (pulling === 0) {
      noFill();
      stroke(SHADOW.RIM[0], SHADOW.RIM[1], SHADOW.RIM[2], 120 * alpha);
      strokeWeight(2);
      for (let ripple = 0; ripple < this.ripples.length; ripple++) {
        const at = ((this.ripples[ripple] + this.ageMs / 700) % 1 || 0.001) * length;
        if (at > length) continue;
        line(at, -half * 0.7, at, half * 0.7);
      }
    }
    pop();
  }

  /** The strip the hold really uses, with a ragged far end. */
  private strip(length: number, half: number): void {
    beginShape();
    vertex(0, -half);
    vertex(length, -half * 0.55);
    vertex(length + 10, 0);
    vertex(length, half * 0.55);
    vertex(0, half);
    endShape(CLOSE);
  }
}

export default class Shikamaru_Q extends api.Spell {
  /**
   * Told, not inferred, and `Cc` is the only honest tag: it deals no damage
   * at all, so every damage-shaped term the scorer has would be a lie. This
   * pack has already shipped a hand-written tag the scorer pays nothing for,
   * and it made the bot use that ability *less*.
   */
  static aiRoles = api.enums.SpellRole.Cc;

  name = 'Kagemane no Jutsu';
  image = api.asset('spell_shikamaru_q');
  description =
    'Bóng của Shikamaru trườn thẳng về phía trước và <span class="buff">trói chân</span> ' +
    'mọi kẻ địch nằm trong vệt, tối đa <span class="time">2.5 giây</span>. Không gây sát ' +
    'thương. Trong lúc giữ, <b>chính anh cũng không được bước</b> — đi một bước, bị choáng ' +
    'hay bị hất là bóng đứt ngay. Nhấn lại để thả.';
  coolDown = Q_COOLDOWN_MS;
  manaCost = Q_CHAKRA;
  range = Q_REACH;

  private shadow: Shikamaru_Q_Shadow | null = null;
  private upkeepMs = 0;

  get castSpec(): Readonly<CastSpec> {
    return {
      activation: 'TOGGLE',
      targeting: 'DIRECTION',
      active: { maxDurationMs: Q_MAX_MS },
      resource: { commitAt: 'start', refundOn: [] },
      cooldown: { startAt: 'end', durationMs: this.coolDown },
      // The one form that breaks on the caster's own movement. See the header:
      // a hold he can walk around with is a hold with no price.
      interrupts: api.enums.SpellForm.CHANNELED,
      suspendedBy: [api.buffs.Stasis],
    };
  }

  onActivate(context: CastContext): void {
    const shadow = new Shikamaru_Q_Shadow(this.owner);
    shadow.position.set(this.owner.position.x, this.owner.position.y);
    shadow.heading = Math.atan2(
      context.cursorWorld.y - this.owner.position.y,
      context.cursorWorld.x - this.owner.position.x
    );
    shadow.attachTo(this.owner);
    this.shadow = shadow;
    this.upkeepMs = 0;
    this.game.objectManager.addObject(shadow);
  }

  onUpdate(): void {
    if (this.state !== 'ACTIVE' || !this.shadow) return;
    if (this.owner.isDead) {
      this.cancel('DEATH');
      return;
    }

    this.upkeepMs += Math.max(0, deltaTime);
    while (this.upkeepMs >= Q_UPKEEP_TICK_MS) {
      // Through `spendMana`, never `stats.mana`: it prices the tick by the
      // match rules, so under URF the hold neither pays upkeep nor runs out
      // of it. Checking and deducting in one call is what stops one of the
      // two halves being written without the rule.
      if (!this.spendMana(Q_UPKEEP)) {
        this.cancel('OUT_OF_RESOURCE');
        return;
      }
      this.upkeepMs -= Q_UPKEEP_TICK_MS;
    }
  }

  onRecast(): void {
    this.letGo();
  }
  onCancel(): void {
    this.letGo();
  }
  onComplete(): void {
    this.letGo();
  }
  deactivate(): void {
    this.letGo();
    super.deactivate();
  }
  onRemoved(): void {
    this.letGo();
    super.onRemoved();
  }

  /** Idempotent, and reached from six endings that can overlap. */
  private letGo(): void {
    this.shadow?.release();
    this.shadow = null;
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
