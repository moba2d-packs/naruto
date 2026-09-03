import { api } from '../packApi';
import { RANGE_BAND } from '../spellVfx';
import { GRIP_CRUSH_DAMAGE, GRIP_ROOT_MS, GRIP_TICK_DAMAGE, GRIP_TICK_MS } from './Gaara_R_Grip';
import { Gaara_R_Surge, SURGE_SPEED } from './Gaara_R_Surge';

const dmg = api.text.dmg;
const dmgValue = api.text.dmgValue;

/**
 * Sabaku Sōsō — the sand runs along the ground and closes on the first person
 * it reaches.
 *
 * The script:
 *
 *   press a direction  → a ridge of sand rises in front of him and sets off
 *   it crosses the gap → slowly, in a straight line, along the floor
 *   the first body     → is swallowed where it stands and cannot move
 *   for 1.4 seconds    → the sand squeezes
 *   at the end         → it crushes, the largest single hit in the kit
 *   if they die first  → the sand falls away with them
 *
 * ## It used to be a lock-on, and that was the bug
 *
 * The first cut targeted a unit: press, and the root simply happened. The
 * report was "instant quá, ko có animation gì bay từ Gaara tới kẻ địch, địch
 * ko né đc, chiêu này quá OP", and it was right on every count. Undodgeable
 * crowd control plus the biggest damage total in the kit, on a ten-second
 * cooldown, is not an ultimate — it is a button that removes whoever the
 * cursor happened to be over. No amount of art would have fixed it, because
 * there was nothing for the art to *show*: the ability had no middle.
 *
 * A travelling wave fixes both halves at once — there is now something to
 * watch, and something to walk out of. It is deliberately the slowest thing
 * either champion in this pack throws.
 */
export const R_RANGE = RANGE_BAND.ULTIMATE_LINE;
export const R_ROOT_MS = GRIP_ROOT_MS;
export const R_TICK_DAMAGE = GRIP_TICK_DAMAGE;
export const R_CRUSH_DAMAGE = GRIP_CRUSH_DAMAGE;

/**
 * How many squeezes one full grip actually lands.
 *
 * `ceil - 1`, not `floor`, because the loop runs only while the grip is
 * *still holding*: a tick falling exactly on the last millisecond never
 * fires. Written the way the loop counts rather than the way the arithmetic
 * looks, because the two disagreed and the tooltip believed the arithmetic.
 */
export const R_SQUEEZES = Math.ceil(GRIP_ROOT_MS / GRIP_TICK_MS) - 1;
/** Every point one full grip is worth: the squeezes and the crush. */
export const R_TOTAL_DAMAGE = GRIP_TICK_DAMAGE * R_SQUEEZES + GRIP_CRUSH_DAMAGE;

/**
 * Roughly how long the wave takes to cross its whole range, in milliseconds.
 *
 * Derived rather than written down, so the tooltip cannot drift from the
 * speed — and exported because it is the number that makes this ability fair.
 * A test asserting "there is time to move" has to assert against something.
 */
export const R_TRAVEL_MS = (R_RANGE / SURGE_SPEED) * (1000 / 60);

export const R_COOLDOWN_MS = 10_000;
export const R_CHAKRA = 100;

export default class Gaara_R extends api.Spell {
  /**
   * **Told, not inferred.** Inference reads an aimed cast as `Damage | Poke |
   * Burst` and stops there, which misses the half that decides when a bot
   * should press it: the root is what makes this worth spending on somebody
   * the team can then finish, rather than on whoever is nearest.
   *
   * All three tags are ones `scoreSpell` actually pays for — this pack has
   * already been burned once by a hand-written tag the scorer has no term
   * for, which made the bot use that ability *less* than the inference it
   * replaced.
   */
  static aiRoles = api.enums.SpellRole.Damage | api.enums.SpellRole.Cc | api.enums.SpellRole.Burst;

  name = 'Sabaku Sōsō';
  image = api.asset('spell_gaara_r');
  description =
    'Một luồng cát <b>bò dọc mặt đất</b> theo hướng chỉ định. Kẻ địch <b>đầu tiên</b> nó chạm ' +
    'tới bị nuốt trọn: <span class="buff">trói chân</span> trong ' +
    `<span class="time">1.4 giây</span>, siết ${dmgValue(8, 'MAGIC')} mỗi 0.4 ` +
    `giây, rồi cát <b>ép lại</b> gây thêm ${dmgValue(24, 'MAGIC')}. ` +
    'Luồng cát đi <b>chậm</b> — né sang bên là thoát.';
  coolDown = R_COOLDOWN_MS;
  manaCost = R_CHAKRA;
  targetingMode = 'DIRECTION' as const;
  range = R_RANGE;

  onSpellCast(): void {
    const surge = new Gaara_R_Surge(this.owner);
    surge.rootMs = R_ROOT_MS;
    surge.rootImage = this.image;
    surge.destination = api.utils.VectorUtils.getVectorWithRange(
      this.owner.position,
      this.aimPoint,
      R_RANGE
    ).to;
    this.game.objectManager.addObject(surge);
  }

  drawPreview(): void {
    super.drawPreview(api.combat.Reach.effectiveRange(this.range, this.owner));
  }
}
