import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { RANGE_BAND, SIGHT, clamp01, snapOut } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;
const dmgValue = api.text.dmgValue;

/**
 * Amaterasu — black fire that will not go out.
 *
 *   press          → the flames light on the first enemy struck
 *   for 4s         → they burn, and healing barely works on them
 *   nothing        → puts it out
 *
 * The heal-cut is the ability, not the damage. Amaterasu's whole reputation
 * is that it cannot be dealt with, and the closest honest translation of that
 * in a game with no unremovable debuffs is: it is not the burn that kills
 * you, it is that you cannot be saved while it is on you.
 *
 * Rendered as black flame with a red rim, which is the one case in this pack
 * that deliberately breaks the "avoid pure black" guidance in
 * `docs/VFX_STANDARD.md`'s colour section — black *is* the identity here, and
 * the rim is what keeps it from vanishing into dark terrain.
 */
export const W2_DAMAGE = 11;
/** How far the fire jumps to whoever is standing with the first victim. */
export const W2_SPREAD_RADIUS = 165;
export const W2_TICK_MS = 500;
export const W2_DURATION_MS = 4_000;
export const W2_HEAL_CUT = 0.6;
export const W2_RANGE = RANGE_BAND.UPGRADED;
export const W2_SPEED = 15;
export const W2_COOLDOWN_MS = 9_000;
export const W2_CHAKRA = 60;

/** The fire itself, riding the victim. */
export class Amaterasu extends api.buffs.DamageOverTime {
  name = 'Amaterasu';
  image = api.asset('spell_sasuke_w2');
}

export class Sasuke_W2_Object extends api.MissileSpellObject {
  speed = W2_SPEED;
  size = 26;
  damage = 0;
  maxHitCount = 1;

  private ageMs = 0;

  update(): void {
    super.update();
    this.ageMs += deltaTime;
  }

  onHit(target: AttackableUnit): void {
    this.ignite(target);

    // It spreads. Amaterasu's whole reputation is that it burns whatever it
    // touches and does not stop, and a single-target burn was the version of
    // that which could not clear a wave or punish a group — the one ability
    // on this roster whose *name* promises an area and delivered a dot on one
    // body.
    const near = this.game.objectManager.queryObjects({
      area: new api.utils.Quadtree.Circle({
        x: target.position.x,
        y: target.position.y,
        r: W2_SPREAD_RADIUS,
      }),
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];
    for (const other of near) {
      if (other !== target) this.ignite(other);
    }
  }

  /** One body catching fire: the burn, the heal-cut, and the flames on them. */
  private ignite(victim: AttackableUnit): void {
    const fire = new Amaterasu(W2_DURATION_MS, this.owner, victim);
    fire.damagePerTick = W2_DAMAGE;
    fire.tickInterval = W2_TICK_MS;
    victim.addBuff(fire);

    const cut = new api.buffs.HealCut(W2_DURATION_MS, this.owner, victim);
    cut.healCut = W2_HEAL_CUT;
    cut.image = api.asset('spell_sasuke_w2');
    victim.addBuff(cut);

    const flame = new AmaterasuFlame(this.owner);
    flame.attachTo(victim, fire);
    this.game.objectManager.addObject(flame);
  }

  draw(): void {
    const spark = this.position;
    const flicker = 1 + Math.sin(this.ageMs / 60) * 0.12;
    push();
    noStroke();
    // Red first and wider, so the black core is readable *as* black rather
    // than as a hole in the canvas.
    fill(190, 20, 20, 150);
    circle(spark.x, spark.y, this.size * 1.9 * flicker);
    fill(12, 6, 10, 245);
    circle(spark.x, spark.y, this.size * flicker);
    noFill();
    stroke(255, 60, 40, 220);
    strokeWeight(2);
    circle(spark.x, spark.y, this.size * 1.25 * flicker);
    pop();
  }
}

/** Black flames standing on whoever caught them. */
export class AmaterasuFlame extends api.SpellObject {
  /**
   * The black flame gives its victim away.
   *
   * It rides the body (`attachTo`) but belongs to **Sasuke's** team — built
   * from `this.owner`, not from the victim — so the sight it grants is his.
   * That is the whole character: Amaterasu does not go out, and standing in a
   * bush with it on you is not hiding.
   *
   * It also resolves the one interaction worth stating. An attached effect is
   * now drawn only while its anchor is visible (`GameObject.visionAnchor`), so
   * on its own this flame would be invisible on an enemy in the dark — but the
   * sight it grants is what lights that enemy, and the fog pass runs before
   * the draw. The victim is revealed, and the flame with them.
   */
  visionRadius = SIGHT.MARK;

  private ageMs = 0;
  private tongues: { angle: number; height: number; phase: number }[] = [];

  onAdded(): void {
    for (let tongue = 0; tongue < 7; tongue++) {
      this.tongues.push({
        angle: (tongue / 7) * Math.PI * 2,
        height: 0.6 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  update(): void {
    if (this.dropIfAttachmentLost()) return;
    const anchor = this._anchorUnit as AttackableUnit | null;
    if (anchor) this.position.set(anchor.position.x, anchor.position.y);
    this.ageMs += deltaTime;
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = 60;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  draw(): void {
    const body = this.position;
    const caught = snapOut(clamp01(this.ageMs / 220));
    push();
    noStroke();
    for (const tongue of this.tongues) {
      const lick = 0.65 + 0.35 * Math.sin(this.ageMs / 105 + tongue.phase);
      const base = 26 * caught;
      const x = body.x + Math.cos(tongue.angle) * base;
      const y = body.y + Math.sin(tongue.angle) * base;
      const tall = 30 * tongue.height * lick * caught;
      // Rim under, core over — the same dark-under-light rule the sage marks
      // needed, inverted because here the *core* is the dark thing.
      fill(220, 40, 30, 190);
      triangle(x, y - tall * 1.15, x - tall * 0.38, y + tall * 0.18, x + tall * 0.38, y + tall * 0.18);
      fill(10, 5, 9, 240);
      triangle(x, y - tall, x - tall * 0.26, y + tall * 0.14, x + tall * 0.26, y + tall * 0.14);
    }
    pop();
  }
}

export default class Sasuke_W2 extends api.Spell {
  name = 'Amaterasu';
  image = api.asset('spell_sasuke_w2');
  description =
    'Đốt kẻ địch đầu tiên trúng bằng lửa đen, <span class="buff">lan sang mọi kẻ địch ' +
    `đứng gần</span>: ${dmgValue(11, 'MAGIC')} mỗi nửa giây trong ` +
    '<span class="time">4 giây</span>, và <span class="buff">giảm 60% hiệu quả hồi máu</span>.';
  coolDown = W2_COOLDOWN_MS;
  manaCost = W2_CHAKRA;
  targetingMode = 'DIRECTION' as const;
  range = W2_RANGE;

  onSpellCast(): void {
    const spark = new Sasuke_W2_Object(this.owner);
    spark.destination = api.utils.VectorUtils.getVectorWithRange(
      this.owner.position,
      this.aimPoint,
      W2_RANGE
    ).to;
    this.game.objectManager.addObject(spark);
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
