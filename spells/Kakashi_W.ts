import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { KAMUI, clamp01, snapOut, windIn } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;

/**
 * Kamui — for three quarters of a second he is not here.
 *
 * The script:
 *
 *   press              → the air in front of his eye winds into a point
 *   0.7 seconds        → nothing can target him and nothing can hurt him
 *   he keeps walking   → the whole time
 *   then               → he unwinds back into the world
 *   nobody is hurt     → at all
 *
 * ## The first thing in this pack you dodge *with*
 *
 * Six champions could avoid damage by not being there. Nobody could be there
 * and not be hit. That is the mechanic — an ability that answers a cast
 * already in the air, which is a different kind of decision from any button
 * this pack has had: it is pressed in reaction, on somebody else's timing.
 *
 * ## `Untargetable` **and** `Invulnerable`, not `Stasis`
 *
 * `Stasis` is the whole Zhonya's package — immune, untargetable, and *frozen*
 * — and its own header says so. Frozen is wrong here: this is a dodge, and a
 * dodge that plants him is a worse escape than walking. Two buffs say the two
 * halves that are true and leave his feet alone. `Invulnerable` deliberately
 * carries no icon (see its header), so the phase's own icon comes from the
 * `Untargetable` row.
 */
export const W_PHASE_MS = 700;
/** The wind-in before he goes, and the unwind on the way back. */
export const W_WIND_MS = 130;
export const W_COOLDOWN_MS = 12_000;
export const W_CHAKRA = 55;

/**
 * The point he goes into, drawn on his body while it holds.
 *
 * Rides him (`attachTo`), so it goes where he goes — the whole ability is
 * that he keeps moving. Dark (no `visionRadius`): it is worn, not landed, and
 * a champion who sees further for having dodged is not what this says.
 */
export class Kakashi_W_Phase extends api.SpellObject {
  private ageMs = 0;
  /** Seeded once — a spiral that re-rolls its start every frame flickers. */
  private phase = 0;

  onAdded(): void {
    this.phase = Math.random() * Math.PI * 2;
  }

  update(): void {
    if (this.dropIfAttachmentLost()) return;
    const body = this._anchorUnit as AttackableUnit | null;
    if (body) this.position.set(body.position.x, body.position.y);
    this.ageMs += deltaTime;
    if (this.ageMs >= W_PHASE_MS) this.toRemove = true;
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = 90;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  draw(): void {
    const going = clamp01(this.ageMs / W_WIND_MS);
    const coming = clamp01((this.ageMs - (W_PHASE_MS - W_WIND_MS)) / W_WIND_MS);
    // Winding in, held, unwinding out — and the *held* stretch is the one
    // where he is actually safe, so it is the one that looks steady.
    const wound = windIn(going) * (1 - snapOut(coming));
    if (wound <= 0.01) return;

    const body = (this._anchorUnit as AttackableUnit | null)?.stats?.size?.value ?? 40;
    const size = body * (0.7 + 0.9 * wound);

    push();
    translate(this.position.x, this.position.y);

    // The absence at the centre. It is the only genuinely dark fill in this
    // champion's kit, and it is what makes the rest read as a *hole* rather
    // than as a red decal.
    noStroke();
    fill(KAMUI.VOID[0], KAMUI.VOID[1], KAMUI.VOID[2], 230 * wound);
    circle(0, 0, size * 0.62);

    // The spiral winding into it, turning the whole time — the third phase
    // of this effect is a movement, not a fade.
    const spin = this.ageMs / 120;
    noFill();
    stroke(KAMUI.EDGE[0], KAMUI.EDGE[1], KAMUI.EDGE[2], 235 * wound);
    strokeWeight(5);
    beginShape();
    for (let step = 0; step <= 90; step++) {
      const t = step / 90;
      const at = this.phase + spin + t * Math.PI * 4.5;
      const r = (size / 2) * (1 - t * 0.9);
      vertex(Math.cos(at) * r, Math.sin(at) * r);
    }
    endShape();

    // The rim, hard and pale, so the hole has an edge on any floor.
    stroke(KAMUI.SPARK[0], KAMUI.SPARK[1], KAMUI.SPARK[2], 245 * wound);
    strokeWeight(2.5);
    circle(0, 0, size);
    pop();
  }
}

export default class Kakashi_W extends api.Spell {
  /**
   * Told, not inferred, and this is the one case where `Shield` is the honest
   * tag rather than the trap: in `scoreSpell` it means "press this when
   * nearly dead", which is *exactly* when a dodge is worth most. The two
   * transforms in this pack take it off for the opposite reason — their best
   * moment is opening a fight at full health.
   */
  static aiRoles = api.enums.SpellRole.Shield | api.enums.SpellRole.Buff;

  name = 'Kamui';
  image = api.asset('spell_kakashi_w');
  description =
    'Kakashi <b>rời khỏi thế giới này</b> trong <span class="time">0.7 giây</span>: không thể ' +
    'bị chọn làm mục tiêu và <span class="buff">miễn mọi sát thương</span>, nhưng vẫn đi lại ' +
    'bình thường. Không gây sát thương.';
  coolDown = W_COOLDOWN_MS;
  manaCost = W_CHAKRA;
  targetingMode = 'SELF' as const;

  onSpellCast(): void {
    const hidden = new api.buffs.Untargetable(W_PHASE_MS, this.owner, this.owner);
    hidden.image = api.asset('spell_kakashi_w');
    this.owner.addBuff(hidden);

    // The other half, and it is a separate buff because it is a separate
    // fact: `Untargetable` stops him being *chosen*, and an area effect
    // chooses nobody. Without this he would still burn in a fire he is
    // standing in.
    const immune = new api.buffs.Invulnerable(W_PHASE_MS, this.owner, this.owner);
    this.owner.addBuff(immune);

    const phase = new Kakashi_W_Phase(this.owner);
    phase.position.set(this.owner.position.x, this.owner.position.y);
    phase.attachTo(this.owner);
    this.game.objectManager.addObject(phase);
  }
}
