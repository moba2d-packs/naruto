import type { AttackableUnit } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { RANGE_BAND, impactBurst } from '../spellVfx';
import { Sasuke_Q_Bolt } from './Sasuke_Q_Bolt';

const Dash = api.buffs.Dash;

/**
 * Chidori — he runs the lightning into someone rather than throwing it.
 *
 * The script, before the code:
 *
 *   press                     → he dashes forward trailing white lightning
 *   the first enemy on the line → takes it, and is briefly stunned
 *   he stops there              → rather than passing through
 *
 * Stopping is the whole character of the ability. A dash that passes through
 * is an escape; a dash that *plants him on the target* is a commitment, which
 * is what an assassin's opener should be — he is now standing next to the
 * person he just hit, and so is everyone they were standing with.
 */
export const Q_DAMAGE = 34;
/**
 * The discharge everyone *else* standing there takes.
 *
 * Small, and deliberately not on the struck target — they already paid full
 * price, and stacking both would put a single ability well past the 15–35
 * band core sets for one. What it buys is that Chidori is no longer a button
 * that does nothing when he lands in a group, which is where an assassin
 * lands.
 */
export const Q_SHOCK = 15;
export const Q_SHOCK_RADIUS = 120;
export const Q_RANGE = RANGE_BAND.ABILITY;
export const Q_DASH_SPEED = 22;
export const Q_STUN_MS = 700;
export const Q_COOLDOWN_MS = 9_500;
export const Q_CHAKRA = 55;
/** How near the target he stops. His body, plus theirs, plus a little. */
export const Q_STOP_GAP = 70;

export default class Sasuke_Q extends api.Spell {
  /**
   * `Dash` is told, never inferred — core's `inferRoles` refuses to guess it
   * on purpose, because a wrong guess there makes a bot flee *with a
   * gap-closer* and run at the thing chasing it. Chidori is a gap-closer that
   * also stuns, so the mask says all three.
   */
  static aiRoles =
    api.enums.SpellRole.Damage |
    api.enums.SpellRole.Dash |
    api.enums.SpellRole.Cc |
    api.enums.SpellRole.Burst;

  name = 'Chidori';
  image = api.asset('spell_sasuke_q');
  description =
    'Lao tới trong luồng sét, gây <span class="damage magic">34</span> sát thương cho kẻ địch ' +
    'đầu tiên chạm phải và <span class="buff">choáng</span> <span class="time">0.7 giây</span>. ' +
    'Sét phóng ra gây <span class="damage magic">15</span> cho kẻ địch xung quanh. ' +
    'Sasuke dừng lại ngay tại mục tiêu.';
  coolDown = Q_COOLDOWN_MS;
  manaCost = Q_CHAKRA;
  targetingMode = 'DIRECTION' as const;
  range = Q_RANGE;

  /** Hit at most once per dash — a pass that damages per frame is a shredder. */
  private struck = false;

  onSpellCast(): void {
    if (!Dash.CanDash(this.owner)) return;
    this.struck = false;

    const aim = api.utils.VectorUtils.getVectorWithRange(
      this.owner.position,
      this.aimPoint,
      api.combat.Reach.effectiveRange(Q_RANGE, this.owner)
    ).to;

    const charge = new Dash(1_200, this.owner, this.owner);
    charge.dashDestination = aim;
    charge.dashSpeed = Q_DASH_SPEED;
    charge.trailSystem = new api.helpers.TrailSystem({
      owner: this.owner as never,
      trailColor: 'rgba(190, 225, 255, 0.55)',
      trailSize: 15,
      maxLength: 20,
      trailLifeTime: 340,
    });
    // `onDashUpdate`, never `onUpdate`: `Dash` implements its movement in
    // `Dash.prototype.onUpdate`, so an instance assignment replaces the frame
    // rather than hooking it and the champion simply stands still. There is a
    // seam test in core for exactly this mistake.
    charge.onDashUpdate = () => this.sweep(charge);
    this.owner.addBuff(charge);
  }

  /** Looks ahead of him each frame for the first body the dash reaches. */
  private sweep(charge: InstanceType<typeof Dash>): void {
    if (this.struck) return;
    const found = this.game.objectManager.queryObjects({
      area: new api.utils.Quadtree.Circle({
        x: this.owner.position.x,
        y: this.owner.position.y,
        r: Q_STOP_GAP,
      }),
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];

    const victim = found[0];
    if (!victim) return;

    this.struck = true;
    victim.takeDamage(Q_DAMAGE, this.owner);
    const held = new api.buffs.Stun(Q_STUN_MS, this.owner, victim);
    // `image` deliberately left alone on `Stun`: its `draw` paints the icon
    // into the world at body size, and that swirl is how the whole screen
    // answers "who is stunned right now". An ability icon is not legible
    // there. `stackId` is still ours.
    held.stackId = 'naruto_sasuke_q_stun';
    victim.addBuff(held);

    // Filled *before* it is handed to the world. `ParticleSystem` defaults to
    // `autoRemoveIfEmpty` and applies it on its very first update, so a system
    // added empty deletes itself before anything is put in it — the trap
    // `SpellObject.useParticles` exists to solve, and which a `Spell` has no
    // `useParticles` of its own to lean on.
    const sparks = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
      'rgba(210, 240, 255, 0.9)',
      0.5
    );
    impactBurst(sparks, victim.position, 18, 34, 13);
    this.game.objectManager.addObject(sparks);

    // The discharge itself — the ability's only picture of the moment it
    // actually does something. Before this the whole visual was the dash's
    // trail, so the hit, the stun and the stop all happened invisibly.
    const bolt = new Sasuke_Q_Bolt(this.owner);
    bolt.position.set(victim.position.x, victim.position.y);
    bolt.radius = Q_SHOCK_RADIUS;
    this.game.objectManager.addObject(bolt);

    const around = this.game.objectManager.queryObjects({
      area: new api.utils.Quadtree.Circle({
        x: victim.position.x,
        y: victim.position.y,
        r: Q_SHOCK_RADIUS,
      }),
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];
    for (const other of around) {
      if (other !== victim) other.takeDamage(Q_SHOCK, this.owner);
    }

    // He plants. Ending the dash here is what makes the ability a commitment
    // rather than a way through a fight.
    charge.dashDestination = this.owner.position.copy();
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
