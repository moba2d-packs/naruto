import type { AttackableUnit, Rectangle } from '@moba2d/core/content/types';
import { api } from '../packApi';
import { clamp01, impactBurst, snapOut } from '../spellVfx';

const QRectangle = api.utils.Quadtree.Rectangle;
const Circle = api.utils.Quadtree.Circle;
const dmg = api.text.dmg;
const heal = api.text.heal;
const dmgValue = api.text.dmgValue;

/**
 * Suna no Tate — the sand comes up around him, and then it goes off.
 *
 * The script:
 *
 *   press                  → sand wraps him and absorbs damage for 4s
 *   the shield breaks      → the sand bursts outward
 *   or the 4s runs out     → the sand bursts outward, the same way
 *   enemies close by       → take damage and are thrown up
 *
 * ## Both endings pay, and that is the point
 *
 * A shield that only rewards being hit is a button pressed on reaction, and a
 * shield that only rewards surviving is a button pressed on cooldown. This
 * one ends the same way either way, so pressing it early to threaten the
 * burst and pressing it late to eat a hit are both real choices.
 *
 * It is also the only thing in Gaara's kit that wants enemies *near* him. Q
 * pushes people off ground and E puts a wall between him and them; without
 * this he would be a champion with no reason to ever be in range of anything.
 */
export const W_SHIELD = 45;
export const W_DURATION_MS = 4_000;
export const W_BURST_DAMAGE = 20;
export const W_BURST_RADIUS = 165;
export const W_AIRBORNE_MS = 450;
export const W_AIRBORNE_HEIGHT = 26;
/** How long the burst stays on screen after it has dealt its damage. */
export const W_BURST_FADE_MS = 380;
export const W_COOLDOWN_MS = 9_000;
export const W_CHAKRA = 55;

/**
 * The armour, and then the explosion. One object, because they are one event
 * seen twice — the shell *becomes* the burst, and splitting them would let
 * the sand vanish for a frame between the two.
 *
 * Deliberately dark (no `visionRadius`): this is worn, not landed. A shield
 * that lit the fog would be a ward every time he pressed W — see the two
 * auras in `spellSight.test.ts`, held to the same rule.
 */
export class Gaara_W_Shell extends api.SpellObject {
  /** The shield this is the picture of. The shell ends when the shield does. */
  shield: InstanceType<typeof api.buffs.Shield> | null = null;

  private ageMs = 0;
  private burstAtMs: number | null = null;
  private plates: { angle: number; radius: number; span: number; drift: number }[] = [];

  private burst = api.helpers.PredefinedParticleSystems.randomMovingParticlesDecreaseSize(
    'rgba(206, 174, 116, 0.9)',
    0.44
  );

  onAdded(): void {
    for (let plate = 0; plate < 10; plate++) {
      this.plates.push({
        angle: (plate / 10) * Math.PI * 2,
        radius: 0.82 + Math.random() * 0.3,
        span: 0.34 + Math.random() * 0.22,
        drift: 0.5 + Math.random() * 0.9,
      });
    }
    this.useParticles(this.burst);
  }

  update(): void {
    if (this.dropIfAttachmentLost()) return;
    const anchor = this._anchorUnit as AttackableUnit | null;
    if (anchor) this.position.set(anchor.position.x, anchor.position.y);
    this.ageMs += deltaTime;

    if (this.burstAtMs === null) {
      // The shield is the clock. Broken early or expired on time both land
      // here, which is what makes the two endings identical to read.
      const gone = !this.shield || this.shield.toRemove || (this.shield.amount ?? 0) <= 0;
      if (gone) this.detonate();
      return;
    }

    if (this.ageMs - this.burstAtMs >= W_BURST_FADE_MS) this.toRemove = true;
  }

  /**
   * Idempotent on purpose. Death, a scene exit and the shield simply running
   * out can all arrive at this in the same frame, and the runtime is allowed
   * to route one ending through more than one path.
   */
  private detonate(): void {
    if (this.burstAtMs !== null) return;
    this.burstAtMs = this.ageMs;

    const caught = this.game.objectManager.queryObjects({
      area: new Circle({ x: this.position.x, y: this.position.y, r: W_BURST_RADIUS }),
      filters: [api.combat.PredefinedFilters.canTakeDamageFromTeam(this.owner.teamId)],
    }) as AttackableUnit[];

    for (const unit of caught) {
      unit.takeDamage(W_BURST_DAMAGE, this.owner, 'MAGIC', 'Suna no Tate');
      impactBurst(this.burst, unit.position, 9, 22, 10);

      const thrown = new api.buffs.Airborne(W_AIRBORNE_MS, this.owner, unit);
      thrown.height = W_AIRBORNE_HEIGHT;
      thrown.image = api.asset('spell_gaara_w');
      unit.addBuff(thrown);
    }
  }

  getDisplayBoundingBox(): Rectangle {
    const reach = W_BURST_RADIUS + 30;
    return new QRectangle({
      x: this.position.x - reach,
      y: this.position.y - reach,
      w: reach * 2,
      h: reach * 2,
      data: this,
    });
  }

  draw(): void {
    const centre = this.position;
    const anchor = this._anchorUnit as AttackableUnit | null;
    const body = anchor?.stats?.size?.value ?? 40;

    push();

    if (this.burstAtMs === null) {
      // ANTICIPATION, worn on the body. Plates orbiting at a stroke rather
      // than a fill, so he stays visible inside his own shield — a champion
      // hidden by his own buff is a champion nobody can aim at.
      // Against the pool core granted, not against `W_SHIELD` — ability power
      // multiplies a shield, so the plates stayed at full thickness until it
      // was down to 45 whatever it started at. See `Sasuke_R`.
      const full = this.shield?._initialAmount ?? 0;
      const integrity = clamp01(full > 0 ? (this.shield?.amount ?? 0) / full : 0);
      const orbit = this.ageMs / 900;
      noFill();
      for (const plate of this.plates) {
        const at = plate.angle + orbit * plate.drift;
        const ring = body * (0.78 + 0.34 * plate.radius);
        // Thicker while it can still take a hit: the worn state has to read
        // the same predicate the burst spends against, or it is lying.
        stroke(74, 52, 26, 190);
        strokeWeight(6 + 4 * integrity);
        arc(centre.x, centre.y, ring, ring, at, at + plate.span);
        stroke(206, 174, 116, 200 + 40 * integrity);
        strokeWeight(3 + 2.5 * integrity);
        arc(centre.x, centre.y, ring, ring, at, at + plate.span);
      }
      pop();
      return;
    }

    // CLIMAX and DISSIPATION. The wave travels outward, which is what the
    // ability just did — art that swept inward over an outward throw would be
    // telling the player the opposite of the game.
    const out = snapOut(clamp01((this.ageMs - this.burstAtMs) / W_BURST_FADE_MS));
    const alpha = 1 - out;
    const span = W_BURST_RADIUS * 2 * (0.35 + 0.65 * out);

    noStroke();
    fill(178, 142, 86, 120 * alpha);
    circle(centre.x, centre.y, span);

    for (const plate of this.plates) {
      const at = plate.angle + out * 0.8 * plate.drift;
      const flung = (W_BURST_RADIUS * out * plate.radius) / 1.1;
      fill(206, 174, 116, 235 * alpha);
      circle(centre.x + Math.cos(at) * flung, centre.y + Math.sin(at) * flung, 9 + plate.span * 12);
    }

    // The rim is drawn on the radius the damage really used, and it is the
    // last thing to go, so the next press is aimed by something true.
    noFill();
    stroke(74, 52, 26, 225 * (1 - out * 0.55));
    strokeWeight(3.5);
    circle(centre.x, centre.y, W_BURST_RADIUS * 2 * (0.35 + 0.65 * out));
    pop();
  }
}

export default class Gaara_W extends api.Spell {
  /**
   * **Told, not inferred — and deliberately not called a shield.**
   *
   * Core's `inferRoles` reads every `SELF` cast as `Buff | Shield`, and the
   * `Shield` half is what has to come off. In `scoreSpell` that flag does not
   * mean "this protects me", it means **"press this when nearly dead"**: +20
   * below half health, −5 above. This ability is at its best opening a fight
   * at full health, where the burst catches people who have not scattered
   * yet — so the inferred tag scores its worst moment highest.
   *
   * That is the same finding Susanoo's tags carry, and it is true here for
   * the same reason even though this genuinely *is* a shield. `Burst` is what
   * lifts it above an ordinary self-buff in the scorer; `Buff` is honest,
   * because for four seconds it is one.
   */
  static aiRoles = api.enums.SpellRole.Buff | api.enums.SpellRole.Burst;

  name = 'Suna no Tate';
  image = api.asset('spell_gaara_w');
  /** `heal`, not `buff`: `buffs/Shield` amplifies this pool — see `Sasuke_R`. */
  description =
    `Cát bọc quanh người, chắn ${heal(W_SHIELD)} sát thương trong ` +
    '<span class="time">4 giây</span>. Khi lớp cát <b>vỡ hoặc hết giờ</b>, nó nổ tung ra: ' +
    `${dmg(20, 'MAGIC')} và <span class="buff">hất tung</span> ` +
    'kẻ địch xung quanh trong <span class="time">0.45 giây</span>.';
  coolDown = W_COOLDOWN_MS;
  manaCost = W_CHAKRA;
  targetingMode = 'SELF' as const;

  onSpellCast(): void {
    const gaara = this.owner;

    const shield = new api.buffs.Shield(W_DURATION_MS, gaara, gaara);
    shield.amount = W_SHIELD;
    // Not `_initialAmount`: `Shield.onCreate` amplifies `amount` and writes
    // that field itself. See `Sasuke_R`.
    // The HUD row says which ability put it there. Three shields drawn as
    // `buff_shield` tell a player nothing about which to play around.
    shield.image = api.asset('spell_gaara_w');
    shield.color = [206, 174, 116];
    gaara.addBuff(shield);

    const shell = new Gaara_W_Shell(gaara);
    shell.shield = shield;
    // Attached so it dies with him rather than bursting over a corpse.
    shell.attachTo(gaara);
    this.game.objectManager.addObject(shell);
  }
}
