import type { AttackableUnit, CastContext, DynamicWall, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { RANGE_BAND, clamp01, snapOut } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;
const Circle = api.utils.Quadtree.Circle;
const SAT = api.utils.SAT;

/** p5's `HALF_PI` only exists inside a running sketch. The value is not in doubt. */
const QUARTER_TURN = Math.PI / 2;

/**
 * Suna Nami — a ridge of sand that does not stand still. It advances, and it
 * takes whoever is in front of it along.
 *
 * The script:
 *
 *   press a direction   → a ridge rises just in front of him
 *   for ~2.5 seconds    → it crawls forward, slowly, across ~300
 *   anyone in its path  → is ploughed along ahead of it and cannot get past
 *   anyone behind it    → is cut off; it is a wall that is leaving
 *   a dash or a blink   → clears it, exactly as it clears map terrain
 *   at the end          → it spreads out and sinks
 *
 * ## Why it moves, and why that is the whole ability
 *
 * The first cut of this was a slab: press, a wall stands there for four
 * seconds. That is Crystallize, and it is Trundle's pillar, and
 * `docs/VFX_STANDARD.md`'s very first rule is that a champion may not wear
 * another champion's shape. It was also the least interesting thing sand
 * could possibly do.
 *
 * A wall that walks is a different verb. A static wall is aimed at a *place*
 * and answers "you may not come through here". This is aimed at a
 * *direction* and answers "you are going that way now" — it is area denial
 * that chases, which nothing else in either pack does. The push-out that
 * makes it work is the same one a static wall uses: a body caught in front
 * resolves to the nearest face, which for something bearing down on it is
 * the *forward* face, so it gets shoved along rather than through. The
 * ploughing is not special-cased. It falls out of the geometry.
 *
 * ## Still no damage
 *
 * A wave that also hurt would be pressed for the damage, and the one
 * decision it exists to create — where do I send this, and who does that
 * strand — would become a bonus on a poke tool.
 */
export const E_TRAVEL = RANGE_BAND.PLACED;
export const E_WALL_LENGTH = 230;
export const E_WALL_THICKNESS = 30;
/** How long the crossing takes. Slow enough to walk around, not to ignore. */
export const E_CROSSING_MS = 2_500;
export const E_RISE_MS = 220;
export const E_SINK_MS = 480;
export const E_COOLDOWN_MS = 11_000;
export const E_CHAKRA = 60;

/** Where the ridge is born, measured from him: clear of his own body. */
export const E_STANDOFF = 90;

export class Gaara_E_Wave extends api.SpellObject implements DynamicWall {
  position = this.owner.position.copy();
  angle = 0;
  length = E_WALL_LENGTH;
  thickness = E_WALL_THICKNESS;

  /** Unit vector the ridge travels along. Written by the spell at cast. */
  heading: { x: number; y: number } = { x: 1, y: 0 };

  private ageMs = 0;
  private travelled = 0;
  private risen = 0;
  private grains: { along: number; lift: number; tilt: number; phase: number }[] = [];

  private _satPolygon: InstanceType<typeof SAT.Polygon> | null = null;
  private _satCircle: InstanceType<typeof SAT.Circle> | null = null;
  private _satResponse: InstanceType<typeof SAT.Response> | null = null;

  onAdded(): void {
    for (let grain = 0; grain < 24; grain++) {
      this.grains.push({
        along: Math.random() * 2 - 1,
        lift: 0.45 + Math.random() * 0.8,
        tilt: (Math.random() - 0.5) * 0.7,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  /**
   * The collision shape, rebuilt in place rather than reallocated.
   *
   * A *moving* wall is the reason this is not the one-shot lazy build a
   * static slab uses: the polygon's own `pos` has to follow the ridge every
   * frame, or the thing that shoves people would stay where the wave started
   * while the picture walked away from it.
   */
  private polygon(): any {
    if (!this._satPolygon) {
      const halfLength = this.length / 2;
      const halfThickness = this.thickness / 2;
      this._satPolygon = new SAT.Polygon(new SAT.Vector(this.position.x, this.position.y), [
        new SAT.Vector(-halfLength, -halfThickness),
        new SAT.Vector(halfLength, -halfThickness),
        new SAT.Vector(halfLength, halfThickness),
        new SAT.Vector(-halfLength, halfThickness),
      ]);
      this._satPolygon.setAngle(this.angle);
      // One scratch circle and one scratch response, reused for every body.
      this._satCircle = new SAT.Circle(new SAT.Vector(0, 0), 1);
      this._satResponse = new SAT.Response();
    }
    this._satPolygon.pos.x = this.position.x;
    this._satPolygon.pos.y = this.position.y;
    return this._satPolygon;
  }

  update(): void {
    this.ageMs += deltaTime;
    if (this.ageMs >= E_CROSSING_MS + E_SINK_MS) {
      this.toRemove = true;
      return;
    }

    this.risen = snapOut(clamp01(this.ageMs / E_RISE_MS));

    if (this.ageMs < E_CROSSING_MS) {
      // A real clock, not a per-frame step: the same distance has to be
      // crossed on a phone dropping frames as on a machine that is not.
      const step = (E_TRAVEL / E_CROSSING_MS) * deltaTime;
      const room = Math.max(0, E_TRAVEL - this.travelled);
      const moved = Math.min(step, room);
      this.travelled += moved;
      this.position.x += this.heading.x * moved;
      this.position.y += this.heading.y * moved;
      this.shoveOut();
    }
  }

  private shoveOut(): void {
    const polygon = this.polygon();
    const circle = this._satCircle!;
    const response = this._satResponse!;

    const units = this.game.objectManager.queryObjects({
      area: new Circle({
        x: this.position.x,
        y: this.position.y,
        r: this.boundingRadius(),
      }),
      // Terrain does not pick sides: it ploughs both teams, and Gaara too.
      filters: [
        api.combat.PredefinedFilters.type(api.units.AttackableUnit),
        api.combat.PredefinedFilters.excludeDead,
      ],
    }) as AttackableUnit[];

    for (const unit of units) {
      // Dashes and blinks cross it, exactly as they cross map terrain.
      if (api.utils.hasFlag(unit.stats.actionState, api.enums.ActionState.IS_GHOSTED)) continue;

      response.clear();
      circle.pos.x = unit.position.x;
      circle.pos.y = unit.position.y;
      circle.r = unit.stats.size.value / 2;

      if (SAT.testPolygonCircle(polygon, circle, response)) {
        unit.position.x += response.overlapV.x;
        unit.position.y += response.overlapV.y;
        unit.onCollideWall?.();
      }
    }
  }

  /**
   * `DynamicWall`: terrain from the first frame, and terrain right up until
   * it stops moving.
   *
   * It blocks *while still rising* on purpose — a barrier somebody can stroll
   * through during its own animation is not a barrier, and a fifth of a
   * second is exactly long enough for the person it was put in front of to
   * use it.
   */
  get blocksMovement(): boolean {
    return !this.toRemove && this.ageMs < E_CROSSING_MS;
  }

  wallVertices(): { x: number; y: number }[] {
    return api.terrain.slabVertices(this.position, this.angle, this.length, this.thickness);
  }

  /** How far it has come, so a test can assert that it actually moves. */
  get distanceTravelled(): number {
    return this.travelled;
  }

  private boundingRadius(): number {
    return Math.sqrt(this.length * this.length + this.thickness * this.thickness) / 2 + 60;
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = this.boundingRadius();
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  draw(): void {
    const sinking = clamp01((this.ageMs - E_CROSSING_MS) / E_SINK_MS);
    const standing = 1 - sinking;
    const halfLength = (this.length / 2) * this.risen;
    // It loses height as it dies, and spreads a little: sand collapsing
    // outward, not a rectangle fading out.
    const halfThickness = (this.thickness / 2) * (1 + sinking * 0.8) * (0.3 + 0.7 * standing);
    const roll = this.ageMs / 110;

    push();
    translate(this.position.x, this.position.y);
    rotate(this.angle);

    // The leading face carries the crest; the trailing face is a low skirt.
    // Two different edges is what says which way this thing is going, from
    // any single frame — the one thing a static wall never has to answer.
    noStroke();
    fill(150, 116, 66, 150 * standing);
    rectMode(CENTER);
    rect(0, halfThickness * 0.9, halfLength * 2, halfThickness * 1.5, 4);

    for (const grain of this.grains) {
      const x = grain.along * halfLength;
      const churn = Math.sin(roll + grain.phase) * 0.5 + 0.5;
      const tall = halfThickness * grain.lift * (0.6 + 0.4 * churn);
      fill(74, 52, 26, 220 * standing);
      triangle(x - 6, -halfThickness, x + 6, -halfThickness, x + grain.tilt * 9, -halfThickness - tall);
      fill(214, 184, 128, 235 * standing);
      triangle(
        x - 4,
        -halfThickness,
        x + 4,
        -halfThickness,
        x + grain.tilt * 7,
        -halfThickness - tall * 0.75
      );
    }

    // A dark rim under the pale body so the ridge holds over grass, stone and
    // water alike.
    stroke(64, 44, 22, 235 * standing);
    strokeWeight(3);
    fill(186, 152, 96, 235 * standing);
    rect(0, 0, halfLength * 2, halfThickness * 2, 4);

    // One highlight along the crest, not a second body.
    noStroke();
    fill(226, 198, 146, 190 * standing);
    rect(0, -halfThickness * 0.45, halfLength * 2, halfThickness * 0.4);

    pop();
  }
}

export default class Gaara_E extends api.Spell {
  /**
   * **Told, not inferred**, and this one is not optional.
   *
   * Inference reads an aimed cast as `Damage | Poke | Burst`, and this
   * ability deals no damage at all — so an untagged wave would be scored as a
   * poke tool and thrown at whoever was nearest, which is the one place it
   * does nothing. `Zone` is the honest reading: it is ground control that
   * happens to move.
   *
   * `Cc` is deliberately left off. It pays more in the scorer, but it claims
   * the ability lands a crowd-control buff a bot can follow up on, and this
   * one lands nothing on anybody — a bot committing to a kill because it
   * believes it just rooted someone is worse than one that presses the wave
   * a little less often.
   */
  static aiRoles = api.enums.SpellRole.Zone;

  name = 'Suna Nami';
  image = api.asset('spell_gaara_e');
  description =
    'Một gờ cát dựng lên trước mặt rồi <b>bò tới</b> theo hướng chỉ định trong ' +
    '<span class="time">2.5 giây</span>. Nó <b>không gây sát thương</b> — nó là địa hình biết ' +
    'đi: ai đứng chắn phía trước bị <b>ủi đi theo</b> và không vượt qua được, ai ở phía sau ' +
    'thì bị cắt lại. Chiêu lướt và dịch chuyển vẫn qua được, và gờ cát ' +
    '<b>không chặn tầm nhìn</b>.';
  coolDown = E_COOLDOWN_MS;
  manaCost = E_CHAKRA;
  targetingMode = 'DIRECTION' as const;
  range = E_TRAVEL;

  onSpellCast(context: CastContext): void {
    // `firingDirection` is what makes a cursor sitting on his own feet still
    // yield a direction: body heading first, then a fixed vector, never
    // `(0,0)` — which `context.direction` is on the origin.
    const heading = this.firingDirection(context);

    const wave = new Gaara_E_Wave(this.owner);
    wave.heading = { x: heading.x, y: heading.y };
    // **Born clear of his own body.** A slab centred on him would resolve him
    // to its *nearest* face, which past the midplane is the far one — so the
    // push would eject him through his own ridge while it stopped everyone
    // else. The standoff is what keeps him behind it, where he belongs.
    wave.position = this.owner.position
      .copy()
      .add(createVector(heading.x * E_STANDOFF, heading.y * E_STANDOFF));
    // The ridge stands *across* the direction it travels, the way a wave does.
    wave.angle = Math.atan2(heading.y, heading.x) + QUARTER_TURN;
    this.game.objectManager.addObject(wave);
  }

  drawPreview(): void {
    super.drawPreview(this.range);
  }
}
