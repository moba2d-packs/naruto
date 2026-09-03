import type {
  AttackableUnit,
  CastContext,
  CastSpec,
  Rectangle,
  TargetingRequest,
} from '@moba2d/core/content/types';
import { api } from '../packApi';
import { KAMUI, clamp01, impactSpray, snapOut } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;
const dmg = api.text.dmg;

/**
 * Shinjū Zanshu no Jutsu — he goes into the ground and comes up behind you.
 *
 * The script:
 *
 *   press on an enemy within 220  → he sinks where he stood
 *   a quarter second later        → he is behind them
 *   they take 20                  → and are buried to the neck: rooted 1s
 *   the hole he left              → closes behind him
 *
 * ## The pack's first cast aimed at an enemy body
 *
 * Sakura's heal was its first `UNIT` spell and it is pointed at a friend.
 * This is the other side, and it carries the trap `docs/ADDING_SPELLS.md`
 * puts in bold: **a `UNIT` spell must declare `targetTeam`**. Left off,
 * targeting defaults to `'ANY'`, the nearest-target fallback resolves *him*
 * with the cursor on empty ground, and the ability teleports him behind
 * himself and roots him. Four abilities in the largest pack shipped exactly
 * that way.
 *
 * ## Behind, not on top
 *
 * The arrival point is on the far side of the target from where he started,
 * which is the difference between a gap-closer and a *reposition*: it puts
 * the rooted body between him and whatever they were walking toward. Landing
 * on top of them would be Sasuke's Chidori with extra steps.
 */
export const E_RANGE = 220;
/** How far past them he surfaces. Roughly a body and a half. */
export const E_BEHIND = 70;
export const E_SINK_MS = 250;
export const E_DAMAGE = 20;
export const E_ROOT_MS = 1_000;
/** Dissipation: the hole closes rather than blinking out. */
export const E_CLOSE_MS = 420;
export const E_COOLDOWN_MS = 11_000;
export const E_CHAKRA = 55;

/** A body this may be pointed at. Team is checked separately, by the spell. */
export const isBurialTarget = (candidate: unknown): candidate is AttackableUnit =>
  candidate instanceof api.units.AttackableUnit &&
  candidate.targetable &&
  !candidate.toRemove &&
  !candidate.isDead;

/**
 * The hole he left, and the one he came out of.
 *
 * Two mouths on one object: they are one journey seen at both ends, and
 * splitting them would let one close a frame before the other opened.
 *
 * Dark (no `visionRadius`): both ends are within 300 of ground he was
 * standing on a quarter of a second ago.
 */
export class Kakashi_E_Burrow extends api.SpellObject {
  /** Where he went in. `position` is where he came out. */
  from = { x: 0, y: 0 };

  private ageMs = 0;

  private soil = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(176, 58, 84, 0.85)',
    0.5
  );

  onAdded(): void {
    this.useParticles(this.soil);
  }

  update(): void {
    this.ageMs += deltaTime;
    if (this.ageMs >= E_CLOSE_MS) this.toRemove = true;
  }

  /** Told by the spell, so the burst lands on the body and not near it. */
  markArrival(on: AttackableUnit): void {
    const away = Math.atan2(on.position.y - this.from.y, on.position.x - this.from.x);
    impactSpray(this.soil, on.position, away, 11, 22, 11);
  }

  getDisplayBoundingBox(): Rectangle {
    const pad = 80;
    return new QRectangle({
      x: Math.min(this.from.x, this.position.x) - pad,
      y: Math.min(this.from.y, this.position.y) - pad,
      w: Math.abs(this.position.x - this.from.x) + pad * 2,
      h: Math.abs(this.position.y - this.from.y) + pad * 2,
      data: this,
    });
  }

  draw(): void {
    const closing = snapOut(clamp01(this.ageMs / E_CLOSE_MS));
    const alpha = 1 - closing;
    if (alpha <= 0) return;

    push();
    // Both mouths, closing together. The far one is drawn wider because it is
    // the one that mattered — it is where he is now.
    this.mouth(this.from.x, this.from.y, 46 * (1 - closing), alpha * 0.7);
    this.mouth(this.position.x, this.position.y, 58 * (1 - closing), alpha);
    pop();
  }

  private mouth(x: number, y: number, size: number, alpha: number): void {
    if (size <= 1) return;
    noStroke();
    fill(KAMUI.VOID[0], KAMUI.VOID[1], KAMUI.VOID[2], 220 * alpha);
    circle(x, y, size);
    noFill();
    stroke(KAMUI.EDGE[0], KAMUI.EDGE[1], KAMUI.EDGE[2], 235 * alpha);
    strokeWeight(4);
    circle(x, y, size * 1.12);
    stroke(KAMUI.SPARK[0], KAMUI.SPARK[1], KAMUI.SPARK[2], 200 * alpha);
    strokeWeight(1.5);
    circle(x, y, size * 1.3);
  }
}

export default class Kakashi_E extends api.Spell {
  /**
   * Told, and `Dash` is the half core refuses to guess: a bot that files a
   * reposition as an escape uses it to run *at* whatever is chasing. `Cc` is
   * the root, which is the reason to press it at all — 20 damage is not.
   */
  static aiRoles =
    api.enums.SpellRole.Dash | api.enums.SpellRole.Cc | api.enums.SpellRole.Damage;

  name = 'Shinjū Zanshu no Jutsu';
  image = api.asset('spell_kakashi_e');
  description =
    'Kakashi lặn xuống đất và trồi lên <b>sau lưng</b> mục tiêu: ' +
    `${dmg(20, 'MAGIC')} và <span class="buff">trói chân</span> ` +
    '<span class="time">1 giây</span> vì bị chôn tới cổ.';
  coolDown = E_COOLDOWN_MS;
  manaCost = E_CHAKRA;
  range = E_RANGE;

  get castSpec(): Readonly<CastSpec> {
    return {
      activation: 'PRESS',
      targeting: 'UNIT',
      castTimeMs: E_SINK_MS,
      resource: { commitAt: 'release', refundOn: ['TARGET_INVALID', 'OUT_OF_RANGE'] },
      cooldown: { startAt: 'release', durationMs: this.coolDown },
    };
  }

  /**
   * **`targetTeam: 'ENEMY'` is not optional.** Omitted, targeting defaults to
   * `'ANY'` and the nearest-target fallback resolves the caster — an ability
   * that teleports him behind himself and roots him. See the header.
   */
  get targetingRequest(): Readonly<TargetingRequest> {
    return {
      range: this.range,
      targetTeam: 'ENEMY',
      queryCandidates: () => this.game.objectManager.objects,
      isTargetable: candidate => isBurialTarget(candidate),
      getTargetInfo: candidate =>
        isBurialTarget(candidate)
          ? {
              position: candidate.position,
              teamId: candidate.teamId,
              selectionRadius: candidate.animatedValues?.displaySize
                ? candidate.animatedValues.displaySize / 2
                : candidate.collisionRadius,
            }
          : null,
    };
  }

  /** The key-press path resolves for us; a bot or a script arrives with nothing. */
  press(context: CastContext): boolean {
    if (context.target !== undefined) return super.press(context);
    const resolved = api.combat.TargetResolver.resolve('UNIT', {
      ...context,
      casterTeamId: this.owner.teamId,
      ...this.targetingRequest,
    });
    return resolved.ok ? super.press(resolved.context) : false;
  }

  checkCastCondition(): boolean {
    return api.buffs.Dash.CanDash(this.owner) && this.isBuriable(this.castContext?.target);
  }

  onUpdate(): void {
    if (this.state === 'CASTING' && !this.isBuriable(this.castContext?.target)) {
      this.cancel('TARGET_INVALID');
    }
  }

  onSpellCast(context: CastContext): void {
    const victim = context.target;
    if (!this.isBuriable(victim)) return;

    const from = { x: this.owner.position.x, y: this.owner.position.y };
    const heading = Math.atan2(victim.position.y - from.y, victim.position.x - from.x);
    const behind = {
      x: victim.position.x + Math.cos(heading) * E_BEHIND,
      y: victim.position.y + Math.sin(heading) * E_BEHIND,
    };

    // Through `moveTo`, not by writing `position`: the engine's own body
    // separation and displacement grace are what keep an arrival from
    // stuttering against whoever is standing there.
    this.owner.moveTo(behind.x, behind.y);
    this.owner.position.set(behind.x, behind.y);
    this.owner.markDisplaced?.();

    victim.takeDamage(E_DAMAGE, this.owner, 'MAGIC', 'Shinjū Zanshu no Jutsu');
    const buried = new api.buffs.Root(E_ROOT_MS, this.owner, victim);
    buried.image = api.asset('spell_kakashi_e');
    buried.buffAddType = api.enums.BuffAddType.RENEW_EXISTING;
    victim.addBuff(buried);

    const burrow = new Kakashi_E_Burrow(this.owner);
    burrow.from = from;
    burrow.position.set(behind.x, behind.y);
    burrow.markArrival(victim);
    this.game.objectManager.addObject(burrow);
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }

  /**
   * Team, sight and reach, asked again on the frame the payload lands.
   *
   * `TargetResolver` checked all three at the press, which is a quarter of a
   * second earlier — long enough for the target to die, walk out or step into
   * a bush.
   */
  private isBuriable(target: unknown): target is AttackableUnit {
    return (
      isBurialTarget(target) &&
      target.teamId !== this.owner.teamId &&
      api.combat.Vision.canSee(this.owner, target) &&
      api.combat.Reach.withinRange(this.range, this.owner, target)
    );
  }
}
