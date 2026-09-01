import type { AttackableUnit } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { chakraTrail, impactBurst } from '../spellVfx';

/**
 * Rasengan — a sphere of chakra ground into whoever it reaches.
 *
 * Short reach rather than long: it is the ability that closes a gap his basic
 * attacks cannot. It travels *slowly enough to be read* — the first cut ran at
 * speed 19 and a player's report was that it was over before it was visible.
 * A skillshot the enemy cannot see coming is not a skillshot.
 */
export const Q_DAMAGE = 26;
export const Q_RANGE = 300;
export const Q_SPEED = 10;
export const Q_SLOW_PERCENT = 0.35;
export const Q_SLOW_MS = 1_200;
export const Q_COOLDOWN_MS = 7_000;
export const Q_CHAKRA = 35;

/** The sphere's own radius, and the radius the damage really uses. */
export const Q_SIZE = 38;

export class Naruto_Q_Object extends api.MissileSpellObject {
  speed = Q_SPEED;
  size = Q_SIZE;
  damage = Q_DAMAGE;
  maxHitCount = 1;

  trailSystem = chakraTrail(this.owner, 'rgba(120, 190, 255, 0.42)', 13);

  /** Seeded once — `random()` inside `draw` flickers instead of animating. */
  private shells: number[] = [];
  private burst = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(180, 225, 255, 0.85)',
    0.55
  );
  private spin = 0;

  onAdded(): void {
    super.onAdded();
    this.useParticles(this.burst);
    for (let shell = 0; shell < 3; shell++) this.shells.push(Math.random() * Math.PI * 2);
  }

  update(): void {
    super.update();
    this.spin += 0.28;
  }

  onHit(target: AttackableUnit): void {
    target.takeDamage(this.damage, this.owner);
    const slow = new api.buffs.Slow(Q_SLOW_MS, this.owner, target);
    slow.percent = Q_SLOW_PERCENT;
    // The ability's own icon on the buff, so a player reading three
    // simultaneous slows can tell which one to play around — the house
    // convention in `docs/VFX_STANDARD.md`. Named directly rather than read
    // off the caster: a `SpellObject`'s owner is an `AttackableUnit` and has
    // no kit to look the spell up in.
    slow.image = api.asset('spell_naruto_q');
    target.addBuff(slow);
    // On the victim, not at the missile's last position: the two differ by a
    // body's width and only one of them answers "did I connect".
    impactBurst(this.burst, target.position, 14, Q_SIZE * 0.5, 11);
  }

  draw(): void {
    const orb = this.position;
    push();
    noStroke();
    // Outer bloom, then body, then core: three values, one focal point.
    fill(90, 165, 255, 55);
    circle(orb.x, orb.y, this.size * 1.7);
    fill(120, 195, 255, 195);
    circle(orb.x, orb.y, this.size);
    fill(235, 248, 255, 235);
    circle(orb.x, orb.y, this.size * 0.42);

    // A hard rim on the *real* hit radius, so the hitbox is not a guess.
    noFill();
    stroke(215, 240, 255, 200);
    strokeWeight(2);
    circle(orb.x, orb.y, this.size);

    // Counter-rotating arcs: the sphere is being spun, not floating. Two
    // directions because one reads as a bubble.
    strokeWeight(3);
    stroke(240, 252, 255, 225);
    for (let shell = 0; shell < this.shells.length; shell++) {
      const phase = this.shells[shell] + this.spin * (shell % 2 === 0 ? 1 : -1.4);
      const span = this.size * (0.82 - shell * 0.18);
      arc(orb.x, orb.y, span, span, phase, phase + 2.2);
    }
    pop();
  }
}

export default class Naruto_Q extends api.Spell {
  name = 'Rasengan';
  image = api.asset('spell_naruto_q');
  description =
    'Nghiền một khối chakra xoáy vào mục tiêu đầu tiên, gây ' +
    '<span class="damage magic">26</span> sát thương và ' +
    '<span class="buff">làm chậm 35%</span> trong <span class="time">1.2 giây</span>.';
  coolDown = Q_COOLDOWN_MS;
  manaCost = Q_CHAKRA;
  targetingMode = 'DIRECTION' as const;
  range = Q_RANGE;

  onSpellCast(): void {
    const shot = new Naruto_Q_Object(this.owner);
    shot.destination = api.utils.VectorUtils.getVectorWithRange(
      this.owner.position,
      this.aimPoint,
      Q_RANGE
    ).to;
    this.game.objectManager.addObject(shot);
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
