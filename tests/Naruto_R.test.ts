/**
 * Kurama Mode — the pack's half of the engine's first transforming ultimate.
 *
 * Core owns whether a stance swaps the right slots and hands back the right
 * instances (`ChampionStance.test.ts` over there). What is this pack's to get
 * right is the *contract around* it: that the form actually holds the three
 * Kurama abilities, that it ends on its own clock, that it ends when the
 * chakra runs out, and — the one that would go unnoticed longest — that a
 * champion who dies mid-form does not respawn still transformed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestApi } from '@moba2d/core/testing';
import { createGame, stubGameGlobals, type TestGame } from '@moba2d/core/testing';
import { pressSpell } from '@moba2d/core/testing/spell';
import Naruto_R, {
  KURAMA_STANCE,
  R_CHAKRA_PER_SECOND,
  R_DURATION_MS,
  R_HEALTH_BONUS,
} from '../spells/Naruto_R';
import { KuramaAura } from '../spells/Naruto_R_Aura';
import Naruto_Q from '../spells/Naruto_Q';
import Naruto_W from '../spells/Naruto_W';
import Naruto_E from '../spells/Naruto_E';
import { basicAttackStub, champion, indexObjects } from './_units';

/** Core's own slot table — never a hand-counted index. */
const SLOT = buildTestApi().enums.SpellSlot;

let game: TestGame;

/** Naruto with his real base kit in slots 0-2 and the ultimate in slot 3. */
/**
 * The engine's real pool, not the 100 `_units.ts` sets for damage tests.
 * `Stats.ts` defaults mana to 500 and `ChampionDefenceTuning` has no mana
 * field, so 500 is what every champion in every pack actually has — and the
 * upkeep below is only honest against that number.
 */
const REAL_MANA = 500;

/**
 * Laid out the way a real kit is: `[attack, Q, W, E, R]`.
 *
 * This suite used to build a bare four without the basic attack, which is
 * exactly the shape that hid the slot bug — a stance filling "the first
 * three" looked right here and replaced attack/Q/W in an actual match.
 */
const naruto = () => {
  const unit = champion(game, 0, 'blue');
  unit.replaceSpells([
    basicAttackStub(unit),
    new Naruto_Q(unit),
    new Naruto_W(unit),
    new Naruto_E(unit),
    new Naruto_R(unit),
  ]);
  unit.stats.mana.baseValue = REAL_MANA;
  unit.stats.maxMana.baseValue = REAL_MANA;
  return unit;
};

/** Runs the champion's own spell loop, which is where the drain lives. */
const advance = (unit: ReturnType<typeof naruto>, ms: number): void => {
  vi.stubGlobal('deltaTime', ms);
  for (const spell of unit.spells) spell.update();
  for (const buff of [...unit.buffs]) buff.update();
};

beforeEach(() => {
  stubGameGlobals();
  vi.stubGlobal('deltaTime', 16);
  game = createGame(2_000);
  // `indexObjects` reads `getDisplayBoundingBox`, which for a champion asks
  // `isAllied`, which asks the world for its player. Without one the world
  // throws on the first champion indexed.
  game.setPlayer(champion(game, 0, 'player-uuid'));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Kurama Mode', () => {
  it('swaps Q, W and E for the Kurama abilities and leaves R alone', () => {
    const unit = naruto();
    const ultimate = unit.spells[SLOT.R];
    indexObjects(game, [unit]);

    pressSpell(unit.spells[SLOT.R], { at: { x: 0, y: 0 } });

    expect(unit.stance).toBe(KURAMA_STANCE);
    expect(unit.spells.map(spell => spell.name)).toEqual([
      'Đánh thường',
      'Bijuu Rasengan',
      'Kurama Arms',
      'Bijuudama',
      'Kurama Mode',
    ]);
    expect(unit.spells[SLOT.R]).toBe(ultimate);
  });

  it('gives the base kit back when the form runs out', () => {
    const unit = naruto();
    const base = [...unit.spells];
    indexObjects(game, [unit]);
    pressSpell(unit.spells[SLOT.R], { at: { x: 0, y: 0 } });

    // Chakra is topped up each step so this test measures the *clock* and not
    // the drain — the two endings are separate tests on purpose.
    for (let elapsed = 0; elapsed <= R_DURATION_MS; elapsed += 1_000) {
      unit.stats.mana.baseValue = REAL_MANA;
      advance(unit, 1_000);
    }

    expect(unit.stance).toBe(null);
    expect(unit.spells).toEqual(base);
  });

  it('never ends the form for lack of mana', () => {
    // There are exactly two ways out — the cap and the player's own second
    // press. A third one firing on an empty pool is what produced the
    // original report ("R bị ngắt khi mana vẫn còn nhiều"): an ability that
    // stops for a reason nobody can see reads as broken even when the
    // arithmetic is right. The upkeep still eats the pool; it just cannot
    // take the form away.
    const unit = naruto();
    indexObjects(game, [unit]);
    pressSpell(unit.spells[SLOT.R], { at: { x: 0, y: 0 } });
    unit.stats.mana.baseValue = 0;

    for (let elapsed = 0; elapsed < 5_000; elapsed += 1_000) advance(unit, 1_000);

    expect(unit.stance).toBe(KURAMA_STANCE);
  });

  it('ends early on a second press', () => {
    // Fifteen seconds of being the biggest thing on screen with a bar over
    // your head is a commitment; being able to put it down is what turns the
    // upkeep into a decision rather than a tax.
    const unit = naruto();
    const base = [...unit.spells];
    indexObjects(game, [unit]);
    pressSpell(unit.spells[SLOT.R], { at: { x: 0, y: 0 } });
    expect(unit.stance).toBe(KURAMA_STANCE);

    advance(unit, 2_000);
    pressSpell(unit.spells[SLOT.R], { at: { x: 0, y: 0 } });

    expect(unit.stance).toBe(null);
    expect(unit.spells).toEqual(base);
  });

  it('fills the room it just made', () => {
    // The raised ceiling alone read as the form taking health away: the bar
    // got longer while the filled part stayed exactly where it was.
    const unit = naruto();
    indexObjects(game, [unit]);
    unit.stats.health.baseValue = 40;

    pressSpell(unit.spells[SLOT.R], { at: { x: 0, y: 0 } });

    expect(unit.stats.health.baseValue).toBeGreaterThan(40);
  });

  it('reaches the full duration on the real pool if he casts nothing', () => {
    // Half of what the retune is for. The first cut charged 6/s against a
    // 500 pool, so running dry was arithmetically impossible and the form
    // always ended on the timer — the tooltip promised an ending that could
    // not happen. This end has to stay reachable too.
    const unit = naruto();
    indexObjects(game, [unit]);
    pressSpell(unit.spells[SLOT.R], { at: { x: 0, y: 0 } });

    for (let elapsed = 0; elapsed < R_DURATION_MS - 1_000; elapsed += 1_000) {
      advance(unit, 1_000);
    }

    expect(unit.stance).toBe(KURAMA_STANCE);
    expect(unit.stats.mana.value).toBeGreaterThan(0);
  });

  it('drains chakra a second at a time rather than every frame', () => {
    const unit = naruto();
    indexObjects(game, [unit]);
    pressSpell(unit.spells[SLOT.R], { at: { x: 0, y: 0 } });
    unit.stats.mana.baseValue = REAL_MANA;

    // Half a second of frames must cost nothing at all: a drain that billed
    // per frame would be sixty times the tooltip.
    for (let frame = 0; frame < 30; frame++) advance(unit, 16);
    expect(unit.stats.mana.value).toBe(REAL_MANA);

    advance(unit, 1_000);
    expect(unit.stats.mana.value).toBe(REAL_MANA - R_CHAKRA_PER_SECOND);
  });

  it('does not leave a dead champion transformed', () => {
    // The case that would go unnoticed longest: a form is a buff, and buffs
    // are stripped on death, so this must come out of the engine for free —
    // but nothing proves it until something asks.
    const unit = naruto();
    indexObjects(game, [unit]);
    pressSpell(unit.spells[SLOT.R], { at: { x: 0, y: 0 } });
    expect(unit.stance).toBe(KURAMA_STANCE);

    unit.takeDamage(9_999, unit);

    expect(unit.isDead).toBe(true);
    expect(unit.stance).toBe(null);
  });

  it('changes the face so the form is legible off the portrait', () => {
    // A transformed champion that looks untransformed is a fifteen-second
    // window the enemy cannot read — reported from a real match as "bật R lên
    // avatar không đổi".
    const unit = naruto();
    indexObjects(game, [unit]);
    const before = unit.avatar;

    pressSpell(unit.spells[SLOT.R], { at: { x: 0, y: 0 } });
    expect(unit.avatar).not.toBe(before);

    for (let elapsed = 0; elapsed <= R_DURATION_MS; elapsed += 1_000) {
      unit.stats.mana.baseValue = REAL_MANA;
      advance(unit, 1_000);
    }
    expect(unit.avatar).toBe(before);
  });

  it('puts a cloak in the world, and takes it away with the form', () => {
    // In the world and not on the body, so the cloak keeps drawing while the
    // champion art is culled — but **not** through fog. This comment used to
    // say the opposite, that the viewer who most needs to see the form is the
    // one across the wall, and that was wrong: fog is fog. An aura painting a
    // hundred pixels across where a champion is hidden is worse than no fog,
    // because the enemy learns exactly where somebody is standing and not
    // that it is a champion at all. `attachTo` below is what ties the two
    // together now — see `GameObject.visionAnchor` in core.
    const unit = naruto();
    indexObjects(game, [unit]);

    pressSpell(unit.spells[SLOT.R], { at: { x: 0, y: 0 } });
    // Both lists: a unit added this tick sits in `_objectToBeAdd` until the
    // manager flushes, which is the same distinction `HostSession.stillQueued`
    // already has to make.
    // Annotated rather than inferred: `KuramaAura` extends `api.SpellObject`,
    // whose type comes off the runtime api object, so a `o is KuramaAura`
    // predicate does not narrow an `unknown[]` here.
    const cloaks = (): KuramaAura[] =>
      [
        ...(game.objectManager.objects as unknown[]),
        ...((game.objectManager as { _objectToBeAdd?: unknown[] })._objectToBeAdd ?? []),
      ].filter(o => o instanceof KuramaAura) as KuramaAura[];
    expect(cloaks()).toHaveLength(1);

    for (let elapsed = 0; elapsed <= R_DURATION_MS; elapsed += 1_000) {
      unit.stats.mana.baseValue = REAL_MANA;
      advance(unit, 1_000);
    }
    // The cloak watches the buff, so it marks itself gone rather than waiting
    // for anyone to remember to remove it.
    for (const cloak of cloaks()) cloak.update();
    expect(cloaks().every(cloak => cloak.toRemove)).toBe(true);
  });

  it('raises the health ceiling and lowers it again without killing him', () => {
    const unit = naruto();
    indexObjects(game, [unit]);
    const ceiling = unit.stats.maxHealth.value;

    pressSpell(unit.spells[SLOT.R], { at: { x: 0, y: 0 } });
    expect(unit.stats.maxHealth.value).toBe(ceiling + R_HEALTH_BONUS);

    // Standing at the raised ceiling when the form ends is the case that
    // needs the clamp — without it he walks out reading more health than he
    // can hold.
    unit.stats.health.baseValue = unit.stats.maxHealth.value;
    for (let elapsed = 0; elapsed <= R_DURATION_MS; elapsed += 1_000) {
      unit.stats.mana.baseValue = REAL_MANA;
      advance(unit, 1_000);
    }

    expect(unit.stats.maxHealth.value).toBe(ceiling);
    expect(unit.stats.health.baseValue).toBe(ceiling);
    expect(unit.isDead).toBe(false);
  });
});
