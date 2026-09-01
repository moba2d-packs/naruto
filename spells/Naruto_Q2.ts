import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';

const Circle = api.utils.Quadtree.Circle;
const QRectangle = api.utils.Quadtree.Rectangle;

/**
 * Bijuu Rasengan — the form's Q, and the reason the form is worth entering.
 *
 * The base Rasengan has to be walked into someone. This one is *thrown*, and
 * it detonates: the trade for entering Kurama Mode is that the ability which
 * needed a step and a half of reach now covers a screen and hits everyone
 * standing near where it lands.
 */
export const Q2_DAMAGE = 34;
export const Q2_SPLASH_DAMAGE = 22;
export const Q2_SPLASH_RADIUS = 150;
export const Q2_RANGE = 640;
export const Q2_SPEED = 15;
export const Q2_COOLDOWN_MS = 8_000;
export const Q2_CHAKRA = 45;

export class Naruto_Q2_Object extends api.MissileSpellObject {
  speed = Q2_SPEED;
  size = 52;
  damage = Q2_DAMAGE;
  maxHitCount = 1;

  private spin = 0;

  update(): void {
    super.update();
    this.spin += 0.5;
  }

  /** Paints well past its own centre, so the culling box has to say so. */
  getDisplayBoundingBox(): Rectangle {
    const reach = Q2_SPLASH_RADIUS;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  onHit(target: AttackableUnit): void {
    target.takeDamage(this.damage, this.owner);
    this.detonate(target);
  }

  /**
   * `struck` is passed in rather than read back off the missile: unlike a
   * beam, `MissileSpellObject` keeps no record of who it hit, and the direct
   * target must not also be caught by the splash — a centre hit would be
   * worth 56 while a graze was worth 22, which is not what the tooltip says.
   */
  private detonate(struck: AttackableUnit): void {
    const caught = this.game.objectManager.queryObjects({
      area: new Circle({
        x: this.position.x,
        y: this.position.y,
        r: Q2_SPLASH_RADIUS,
      }),
      // No vision filter: this is an area that detonates over whatever it
      // overlaps, so a champion standing in an unlit bush inside the blast
      // must still be hit.
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];
    for (const unit of caught) {
      if (unit === struck) continue;
      unit.takeDamage(Q2_SPLASH_DAMAGE, this.owner);
    }
  }

  draw(): void {
    const orb = this.position;
    push();
    noStroke();
    fill(255, 90, 40, 60);
    circle(orb.x, orb.y, this.size * 1.8);
    fill(255, 140, 40, 200);
    circle(orb.x, orb.y, this.size);
    fill(30, 10, 10, 220);
    circle(orb.x, orb.y, this.size * 0.55);
    stroke(255, 220, 150, 240);
    strokeWeight(4);
    noFill();
    arc(orb.x, orb.y, this.size * 0.85, this.size * 0.85, this.spin, this.spin + 2.6);
    pop();
  }
}

export default class Naruto_Q2 extends api.Spell {
  name = 'Bijuu Rasengan';
  image = api.asset('spell_naruto_q2');
  description =
    'Ném khối chakra vĩ thú, gây <span class="damage">34</span> sát thương lên mục tiêu trúng ' +
    'và <span class="damage">22</span> cho kẻ địch xung quanh.';
  coolDown = Q2_COOLDOWN_MS;
  manaCost = Q2_CHAKRA;
  targetingMode = 'DIRECTION' as const;
  range = Q2_RANGE;

  onSpellCast(): void {
    const shot = new Naruto_Q2_Object(this.owner);
    shot.destination = api.utils.VectorUtils.getVectorWithRange(
      this.owner.position,
      this.aimPoint,
      Q2_RANGE
    ).to;
    this.game.objectManager.addObject(shot);
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
