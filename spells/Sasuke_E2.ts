import type { AttackableUnit, CastContext, CastSpec, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { RANGE_BAND, clamp01, impactBurst, snapOut } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;

/**
 * Indra's Arrow — drawn on the Susanoo's bow, then loosed.
 *
 *   hold        → the bow draws and the arrow brightens
 *   release     → it flies, piercing everything on the line
 *   full draw   → it hits for the most this pack can
 *
 * A charge rather than a press because it is the form's finisher and it
 * should cost a decision, not a keypress: holding it is standing still inside
 * a fight, in a body that is already the largest thing on the screen.
 *
 * Deliberately the mirror of Naruto's Bijuudama, which is the same *role*
 * from the other champion — that one is a slow sphere that ends in a crater,
 * this one is a fast line that ends in nothing. One rewards placing the far
 * end, the other rewards lining bodies up.
 */
export const E2_MIN_DAMAGE = 45;
export const E2_MAX_DAMAGE = 75;
export const E2_RANGE = RANGE_BAND.ULTIMATE_LINE;
export const E2_SPEED = 26;
export const E2_CHARGE_MS = 900;
export const E2_COOLDOWN_MS = 10_000;
export const E2_CHAKRA = 85;

export const drawnDamage = (ratio: number): number =>
  E2_MIN_DAMAGE + (E2_MAX_DAMAGE - E2_MIN_DAMAGE) * clamp01(ratio);

/** The bow being drawn, on his body, where an enemy can read it. */
export class Sasuke_E2_Draw extends api.SpellObject {
  ratio = 0;
  private ageMs = 0;

  update(): void {
    if (this.dropIfAttachmentLost()) return;
    const anchor = this._anchorUnit as AttackableUnit | null;
    if (anchor) this.position.set(anchor.position.x, anchor.position.y);
    this.ageMs += deltaTime;
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = 96;
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
    const aim = this.owner.game?.worldMouse;
    const heading = Math.atan2(
      (aim?.y ?? body.y) - body.y,
      (aim?.x ?? body.x + 1) - body.x
    );
    const drawn = clamp01(this.ratio);
    const span = 62;

    push();
    // The bow: an arc across his facing, opening wider as it is drawn.
    noFill();
    stroke(180, 140, 255, 180 + 60 * drawn);
    strokeWeight(4 + 2 * drawn);
    arc(body.x, body.y, span * 2, span * 2, heading - 1.15, heading + 1.15);

    // The string, pulled back behind him — the part that says how far along
    // the draw is without needing a number.
    const pull = span * (0.15 + 0.55 * drawn);
    const tipA = {
      x: body.x + Math.cos(heading - 1.15) * span,
      y: body.y + Math.sin(heading - 1.15) * span,
    };
    const tipB = {
      x: body.x + Math.cos(heading + 1.15) * span,
      y: body.y + Math.sin(heading + 1.15) * span,
    };
    const nock = { x: body.x - Math.cos(heading) * pull, y: body.y - Math.sin(heading) * pull };
    stroke(225, 205, 255, 220);
    strokeWeight(2);
    line(tipA.x, tipA.y, nock.x, nock.y);
    line(tipB.x, tipB.y, nock.x, nock.y);

    // The arrow, brightening and lengthening with the draw.
    const shaft = span * (0.7 + 0.9 * drawn);
    stroke(190, 210, 255, 200 + 55 * drawn);
    strokeWeight(5 + 4 * drawn);
    line(nock.x, nock.y, nock.x + Math.cos(heading) * shaft, nock.y + Math.sin(heading) * shaft);
    pop();
  }
}

export class Sasuke_E2_Object extends api.MissileSpellObject {
  speed = E2_SPEED;
  size = 30;
  damage = E2_MIN_DAMAGE;
  maxHitCount = Infinity;

  private ageMs = 0;
  private burst = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(200, 215, 255, 0.9)',
    0.4
  );

  onAdded(): void {
    super.onAdded();
    this.useParticles(this.burst);
  }

  update(): void {
    super.update();
    this.ageMs += deltaTime;
  }

  onHit(target: AttackableUnit): void {
    target.takeDamage(this.damage, this.owner);
    impactBurst(this.burst, target.position, 18, 30, 13);
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = 120;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  draw(): void {
    const head = this.position;
    const back = Math.atan2(
      this.position.y - this.destination.y,
      this.position.x - this.destination.x
    );
    const streak = 110 * snapOut(clamp01(this.ageMs / 90));
    push();
    // A long bolt rather than a dot: at speed 26 a round head is a stutter of
    // disconnected circles, and the streak is what makes it read as one line.
    stroke(150, 170, 255, 90);
    strokeWeight(this.size * 0.9);
    line(head.x, head.y, head.x + Math.cos(back) * streak, head.y + Math.sin(back) * streak);
    stroke(215, 230, 255, 235);
    strokeWeight(this.size * 0.34);
    line(head.x, head.y, head.x + Math.cos(back) * streak * 0.7, head.y + Math.sin(back) * streak * 0.7);
    noStroke();
    fill(245, 250, 255, 245);
    circle(head.x, head.y, this.size * 0.7);
    pop();
  }
}

export default class Sasuke_E2 extends api.Spell {
  name = "Indra's Arrow";
  image = api.asset('spell_sasuke_e2');
  description =
    'Giương cung Susanoo. Thả ra bắn một mũi tên sét <span class="buff">xuyên qua</span> mọi ' +
    'kẻ địch trên đường, gây <span class="damage magic">45–75</span> sát thương tuỳ thời gian giương.';
  manaCost = E2_CHAKRA;
  coolDown = E2_COOLDOWN_MS;
  range = E2_RANGE;

  private drawing: Sasuke_E2_Draw | null = null;
  private ratio = 0;

  get castSpec(): Readonly<CastSpec> {
    return {
      activation: 'HOLD_RELEASE',
      targeting: 'DIRECTION',
      castTimeMs: 0,
      charge: { maxDurationMs: E2_CHARGE_MS, releaseAtMax: true },
      resource: { commitAt: 'release', refundOn: ['STUN', 'SILENCE', 'DEATH', 'PLAYER_CANCEL'] },
      cooldown: { startAt: 'release', durationMs: E2_COOLDOWN_MS },
      // He is drawing a bow and may still walk; crowd control still ends it,
      // because his own hands are what is holding it.
      interrupts: api.enums.SpellForm.AIMED,
    };
  }

  onCastStart(): void {
    this.ratio = 0;
    const bow = new Sasuke_E2_Draw(this.owner);
    bow.attachTo(this.owner);
    this.drawing = bow;
    this.game.objectManager.addObject(bow);
  }

  onChargeUpdate(_context: CastContext, _elapsedMs: number, ratio: number): void {
    this.ratio = ratio;
    if (this.drawing) this.drawing.ratio = ratio;
  }

  onRelease(): void {
    const ratio = this.ratio;
    this.clearDraw();

    const arrow = new Sasuke_E2_Object(this.owner);
    arrow.damage = drawnDamage(ratio);
    arrow.destination = api.utils.VectorUtils.getVectorWithRange(
      this.owner.position,
      this.aimPoint,
      E2_RANGE
    ).to;
    this.game.objectManager.addObject(arrow);
  }

  onCancel(): void {
    this.clearDraw();
  }

  onComplete(): void {
    this.clearDraw();
  }

  /** Idempotent: one hold can reach `onRelease` and `onComplete` both. */
  private clearDraw(): void {
    if (!this.drawing) return;
    this.drawing.toRemove = true;
    this.drawing = null;
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
